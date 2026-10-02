//! OIDC sign-in for a desktop app: authorization code + PKCE through the system browser, with a one-shot
//! loopback listener (RFC 8252). The refresh token lives in the OS keychain and never reaches the webview;
//! the access token is kept in memory only.

use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine};
use rand::RngCore;
use serde::Deserialize;
use sha2::{Digest, Sha256};
use std::collections::HashMap;
use std::sync::Mutex;
use std::time::{Duration, Instant};
use tauri::{AppHandle, State};
use tauri_plugin_opener::OpenerExt;
use tokio::io::{AsyncReadExt, AsyncWriteExt};

const SERVICE: &str = "uriel-companion";
const REFRESH_ENTRY: &str = "refresh-token";
const API_KEY_ENTRY: &str = "api-key";
const SIGN_IN_TIMEOUT: Duration = Duration::from_secs(300);
const EXPIRY_MARGIN: Duration = Duration::from_secs(30);

pub fn random_token() -> String {
    let mut bytes = [0u8; 32];
    rand::thread_rng().fill_bytes(&mut bytes);
    URL_SAFE_NO_PAD.encode(bytes)
}

pub fn challenge_for(verifier: &str) -> String {
    URL_SAFE_NO_PAD.encode(Sha256::digest(verifier.as_bytes()))
}

pub fn authorize_url(endpoint: &str, client_id: &str, redirect_uri: &str, challenge: &str, state: &str)
    -> Result<String, String> {
    let mut url = url::Url::parse(endpoint).map_err(|e| e.to_string())?;
    url.query_pairs_mut()
        .append_pair("response_type", "code")
        .append_pair("client_id", client_id)
        .append_pair("redirect_uri", redirect_uri)
        .append_pair("scope", "openid profile groups offline_access")
        .append_pair("code_challenge", challenge)
        .append_pair("code_challenge_method", "S256")
        .append_pair("state", state);
    Ok(url.into())
}

/// Parses the browser's request line, e.g. `GET /callback?code=abc&state=xyz HTTP/1.1`.
pub fn parse_callback(request_line: &str, expected_state: &str) -> Result<String, String> {
    let target = request_line.split_whitespace().nth(1).ok_or("malformed callback request")?;
    let url = url::Url::parse(&format!("http://127.0.0.1{target}")).map_err(|e| e.to_string())?;
    if url.path() != "/callback" {
        return Err("unexpected callback path".into());
    }
    let q: HashMap<String, String> = url.query_pairs().into_owned().collect();
    if let Some(err) = q.get("error") {
        return Err(format!("sign-in refused: {err}"));
    }
    if q.get("state").map(String::as_str) != Some(expected_state) {
        return Err("sign-in state mismatch".into());
    }
    q.get("code").cloned().ok_or_else(|| "no code in the callback".into())
}

pub fn is_fresh(expires_at: Instant, now: Instant) -> bool {
    now + EXPIRY_MARGIN < expires_at
}

#[derive(Debug)]
pub enum TokenError {
    /// The token endpoint said no (bad or expired refresh token): sign in again.
    Refused(String),
    /// Network trouble or a server error: try again later, keep the refresh token.
    Failed(String),
}

pub fn classify_token_status(status: u16) -> TokenError {
    if (400..500).contains(&status) {
        TokenError::Refused(format!("token endpoint refused: {status}"))
    } else {
        TokenError::Failed(format!("token endpoint failed: {status}"))
    }
}

#[derive(Deserialize)]
struct Discovery {
    authorization_endpoint: String,
    token_endpoint: String,
}

#[derive(Deserialize)]
struct TokenResponse {
    access_token: String,
    expires_in: Option<u64>,
    refresh_token: Option<String>,
}

#[derive(Default)]
pub struct Session {
    access: Mutex<Option<(String, Instant)>>,
    /// Held across a refresh: Authelia rotates refresh tokens, so two concurrent refreshes would race and the loser's
    /// `invalid_grant` would sign the person out.
    refreshing: tokio::sync::Mutex<()>,
}

/// Keychain errors carry this prefix so the webview can tell them from network trouble.
fn keychain_error(e: keyring::Error) -> String {
    format!("keychain: {e}")
}

fn entry(name: &str) -> Result<keyring::Entry, String> {
    keyring::Entry::new(SERVICE, name).map_err(keychain_error)
}

fn read_secret(name: &str) -> Result<Option<String>, String> {
    match entry(name)?.get_password() {
        Ok(v) => Ok(Some(v)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(keychain_error(e)),
    }
}

fn delete_secret(name: &str) -> Result<(), String> {
    match entry(name)?.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(keychain_error(e)),
    }
}

fn cached_access(session: &Session) -> Option<String> {
    let cached = session.access.lock().unwrap().clone();
    cached.filter(|(_, expires)| is_fresh(*expires, Instant::now())).map(|(token, _)| token)
}

async fn discover(issuer: &str) -> Result<Discovery, String> {
    let url = format!("{}/.well-known/openid-configuration", issuer.trim_end_matches('/'));
    reqwest::get(url).await.map_err(|e| e.to_string())?
        .error_for_status().map_err(|e| e.to_string())?
        .json().await.map_err(|e| e.to_string())
}

async fn token_request(endpoint: &str, form: &[(&str, &str)]) -> Result<TokenResponse, TokenError> {
    let res = reqwest::Client::new().post(endpoint).form(form).send().await
        .map_err(|e| TokenError::Failed(e.to_string()))?;
    if !res.status().is_success() {
        return Err(classify_token_status(res.status().as_u16()));
    }
    res.json().await.map_err(|e| TokenError::Failed(e.to_string()))
}

fn keep(session: &Session, t: TokenResponse) -> Result<String, String> {
    // Authelia rotates refresh tokens: always store the newest one.
    if let Some(r) = &t.refresh_token {
        entry(REFRESH_ENTRY)?.set_password(r).map_err(keychain_error)?;
    }
    let expires = Instant::now() + Duration::from_secs(t.expires_in.unwrap_or(300));
    *session.access.lock().unwrap() = Some((t.access_token.clone(), expires));
    Ok(t.access_token)
}

async fn receive_code(listener: &tokio::net::TcpListener, state: &str) -> Result<String, String> {
    loop {
        let (mut sock, _) = listener.accept().await.map_err(|e| e.to_string())?;
        let mut buf = vec![0u8; 8192];
        let n = sock.read(&mut buf).await.map_err(|e| e.to_string())?;
        let head = String::from_utf8_lossy(&buf[..n]);
        let line = head.lines().next().unwrap_or("");
        // Browsers also ask for /favicon.ico; only the callback counts.
        if !line.contains(" /callback") {
            let _ = sock.write_all(b"HTTP/1.1 404 Not Found\r\nConnection: close\r\n\r\n").await;
            continue;
        }
        let result = parse_callback(line, state);
        let body = if result.is_ok() {
            "You're signed in to Uriel. You can close this tab."
        } else {
            "Sign-in didn't work. Go back to Uriel and try again."
        };
        let reply = format!(
            "HTTP/1.1 200 OK\r\nContent-Type: text/plain; charset=utf-8\r\nConnection: close\r\n\r\n{body}"
        );
        let _ = sock.write_all(reply.as_bytes()).await;
        return result;
    }
}

async fn refresh(session: &Session, issuer: &str, client_id: &str) -> Result<Option<String>, String> {
    let _single_flight = session.refreshing.lock().await;
    // Someone may have refreshed while we waited for the lock.
    if let Some(token) = cached_access(session) {
        return Ok(Some(token));
    }
    let Some(stored) = read_secret(REFRESH_ENTRY)? else { return Ok(None) };
    let d = discover(issuer).await?;
    let form = [("grant_type", "refresh_token"), ("refresh_token", stored.as_str()), ("client_id", client_id)];
    match token_request(&d.token_endpoint, &form).await {
        Ok(t) => keep(session, t).map(Some),
        Err(TokenError::Refused(_)) => {
            delete_secret(REFRESH_ENTRY)?;
            Ok(None)
        }
        Err(TokenError::Failed(e)) => Err(e),
    }
}

#[tauri::command]
pub async fn sign_in(app: AppHandle, session: State<'_, Session>, issuer: String, client_id: String,
                     redirect_port: u16) -> Result<(), String> {
    let d = discover(&issuer).await?;
    let listener = tokio::net::TcpListener::bind(("127.0.0.1", redirect_port)).await.map_err(|e| e.to_string())?;
    let port = listener.local_addr().map_err(|e| e.to_string())?.port();
    let redirect = format!("http://127.0.0.1:{port}/callback");
    let verifier = random_token();
    let state = random_token();
    let url = authorize_url(&d.authorization_endpoint, &client_id, &redirect, &challenge_for(&verifier), &state)?;
    app.opener().open_url(url, None::<&str>).map_err(|e| e.to_string())?;
    let code = tokio::time::timeout(SIGN_IN_TIMEOUT, receive_code(&listener, &state))
        .await
        .map_err(|_| "sign-in timed out".to_string())??;
    let form = [
        ("grant_type", "authorization_code"),
        ("code", code.as_str()),
        ("redirect_uri", redirect.as_str()),
        ("client_id", client_id.as_str()),
        ("code_verifier", verifier.as_str()),
    ];
    let t = token_request(&d.token_endpoint, &form).await.map_err(|e| match e {
        TokenError::Refused(m) | TokenError::Failed(m) => m,
    })?;
    keep(&session, t).map(|_| ())
}

#[tauri::command]
pub async fn access_token(session: State<'_, Session>, issuer: String, client_id: String)
    -> Result<Option<String>, String> {
    if let Some(token) = cached_access(&session) {
        return Ok(Some(token));
    }
    refresh(&session, &issuer, &client_id).await
}

#[tauri::command]
pub async fn refresh_access_token(session: State<'_, Session>, issuer: String, client_id: String)
    -> Result<bool, String> {
    *session.access.lock().unwrap() = None;
    Ok(refresh(&session, &issuer, &client_id).await?.is_some())
}

#[tauri::command]
pub fn sign_out(session: State<'_, Session>) -> Result<(), String> {
    *session.access.lock().unwrap() = None;
    delete_secret(REFRESH_ENTRY)
}

#[tauri::command]
pub fn api_key() -> Result<Option<String>, String> {
    read_secret(API_KEY_ENTRY)
}

#[tauri::command]
pub fn set_api_key(key: String) -> Result<(), String> {
    entry(API_KEY_ENTRY)?.set_password(&key).map_err(keychain_error)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn pkce_challenge_matches_rfc7636_example() {
        assert_eq!(
            challenge_for("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"),
            "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM"
        );
    }

    #[test]
    fn random_tokens_are_long_and_different() {
        let (a, b) = (random_token(), random_token());
        assert_ne!(a, b);
        assert!(a.len() >= 43);
    }

    #[test]
    fn authorize_url_carries_pkce_and_the_loopback_redirect() {
        let url = authorize_url("https://auth.example/api/oidc/authorization", "uriel-companion",
                                "http://127.0.0.1:5000/callback", "CH", "ST").unwrap();
        let u = url::Url::parse(&url).unwrap();
        let q: std::collections::HashMap<_, _> = u.query_pairs().into_owned().collect();
        assert_eq!(q["response_type"], "code");
        assert_eq!(q["code_challenge"], "CH");
        assert_eq!(q["code_challenge_method"], "S256");
        assert_eq!(q["redirect_uri"], "http://127.0.0.1:5000/callback");
        assert_eq!(q["state"], "ST");
        assert!(q["scope"].contains("offline_access") && q["scope"].contains("groups"));
    }

    #[test]
    fn callback_parsing() {
        assert_eq!(parse_callback("GET /callback?code=abc&state=xyz HTTP/1.1", "xyz").unwrap(), "abc");
        assert!(parse_callback("GET /callback?code=abc&state=bad HTTP/1.1", "xyz").unwrap_err().contains("state"));
        assert!(parse_callback("GET /callback?error=access_denied&state=xyz HTTP/1.1", "xyz")
            .unwrap_err().contains("access_denied"));
        assert!(parse_callback("GET /callback?state=xyz HTTP/1.1", "xyz").is_err());
        assert!(parse_callback("GET /other?code=a&state=xyz HTTP/1.1", "xyz").is_err());
        assert!(parse_callback("garbage", "xyz").is_err());
    }

    #[test]
    fn tokens_close_to_expiry_are_not_fresh() {
        let now = Instant::now();
        assert!(!is_fresh(now + Duration::from_secs(10), now));
        assert!(is_fresh(now + Duration::from_secs(120), now));
    }

    #[test]
    fn only_fresh_cached_tokens_are_reused() {
        let session = Session::default();
        assert_eq!(cached_access(&session), None);
        *session.access.lock().unwrap() = Some(("old".into(), Instant::now() + Duration::from_secs(5)));
        assert_eq!(cached_access(&session), None);
        *session.access.lock().unwrap() = Some(("new".into(), Instant::now() + Duration::from_secs(300)));
        assert_eq!(cached_access(&session).as_deref(), Some("new"));
    }

    #[test]
    fn keychain_errors_are_marked_for_the_webview() {
        assert!(keychain_error(keyring::Error::NoEntry).starts_with("keychain: "));
    }

    #[test]
    fn refused_and_failed_refresh_are_told_apart() {
        // 4xx from the token endpoint means the refresh token is dead; anything else may be a blip.
        assert!(matches!(classify_token_status(400), TokenError::Refused(_)));
        assert!(matches!(classify_token_status(401), TokenError::Refused(_)));
        assert!(matches!(classify_token_status(503), TokenError::Failed(_)));
    }
}
