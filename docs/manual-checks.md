# Manual checks per OS

Run on Linux (KDE Wayland), macOS and Windows before tagging a release.

| Check | Expected |
|---|---|
| First run | "Where does Uriel live?" screen, prefilled with the home address |
| Sign in | Browser opens Authelia; after login the tab says "You're signed in"; the app opens the chat |
| Restart the app | No sign-in needed (refresh token in the keychain: Keychain / Credential Manager / KWallet or GNOME Keyring) |
| Send a message that uses a tool | thinking → searching/working with a ticker line → happy roll and chime as the reply text starts streaming → the voice follows about a second later, talking → idle when it stops |
| Say "hello" (no tool) | thinking → the line clears as the reply streams → back to idle with a blink; no roll, no chime |
| Stop the gateway mid-answer | Partial reply stays; red shake; "I can't reach home right now." with Retry |
| Retry after restarting the gateway | Same message answered, no second user bubble |
| Minimise the window for a minute | CPU of the app process near 0% (check `top` / Activity Monitor / Task Manager) |
| Idle 10 minutes (Settings → Sleep after) | Yawn, then a bedroom rises: it hurries to the foot of the bed, crouches and jumps backwards into it, landing sitting up under the blanket to sleep, with rising "z"; moving the mouse or pressing a key wakes it, the bedroom sinks and it's back on the floor |
| Chat for 10+ minutes using only the keyboard | It never yawns or falls asleep after a reply |
| Poke three times while it works on a tool call | Dizzy for 3 s, then back to working without the work chime |
| Hover until the hearts, then poke | Hearts, then the annoyed eyes on top; neither changes the colour |
| Poke three times fast | Dizzy for 3 s with the note, then back |
| Mute, restart | Still muted |
| Ask something with a long answer | A mouth appears and talks with blips behind the text; it settles to idle when it stops talking |
| Send a new message while it talks | Quick downward chirp, squash and wide eyes; the new turn starts |
| Click the character while it talks | Same interrupt; the rest of that answer stays silent and it settles to idle |
| Mute while it talks | The mouth keeps moving, no blips |
| Settings → Voice off, then ask something | No speech blips, the mouth still talks; other sounds (send, finish) still play |
| Settings → Long replies: Fit in 8 s / First bit | Fit speeds up long answers to end ≤ 8 s after the text; First bit stops after two sentences |
| Switch conversation (or New chat) while it talks | It stops quietly, no chirp, no finish chime |
| An answer that says something, uses a tool, then answers | Talking look, then working dots, then talking again; no mouth while the tool runs |
| Leave it idle, mouse still | It drifts around its square every few seconds and glances around, sometimes towards where it then goes |
| Move the mouse while it wanders | Eyes follow the mouse at once; it never wanders under the answer text |
| Poke it | The body wobbles and settles (grid barely moves); a ripple rings out through the background |
| Ask something | Each syllable pulses the body gently and ripples the background |
| Customization → Body sliders, then switch character and back | Each character keeps its own feel; Reset goes back to the defaults |
| Customization → Background off / opacity | Blobs disappear / fade; the setting survives a restart |
| Ask something that uses tools | Searching: the camera pulls back and two pairs of bookshelves rise; it goes from shelf to shelf, browsing each with its back to you. Working: a desk and stool rise; it goes round the desk, hops onto the stool and sits facing you across the desk, the pen scribbling over it. It walks round the furniture, never through it; when the tool finishes the furniture sinks and the camera comes back in |
| Point at or poke it while the camera is pulled back | Hover, poke and the eyes following the mouse still land on the character, wherever it is in the room |
| A question or approval arrives while it's off to the side | It comes back to the centre quickly, then barely moves |
| Let an answer finish | It comes to the centre to talk, sways gently, then does a little jump and drifts slowly once finished; never dashes |
| Customization → Liveliness 0 / 1, then restart | 0: it stays put in every state (eyes still glance); 1: wider, quicker moves; the value survives a restart |
| Click the gear (or Ctrl+Shift+D) | A separate settings window appears with Customization and Settings tabs; the chat in the main window stays visible |
| Click the gear again while it's open | The settings window comes to the front; no second window |
| Close the settings window, click the gear | It reappears at once with the same controls (it was hidden, not destroyed) |
| Close the main window with the settings window hidden, then again with it open | The app exits both times (no leftover process) |
| Drag Liveliness, Volume or a Body slider in the settings window | The character responds live while dragging; the slider does not jump back |
| Settings → Sound off, or the header speaker | Each follows the other |
| Customization → Appearance → pick another character | The Body sliders show that character's feel |
| Open the settings window while the sign-in or setup screen is showing | "Waiting for Uriel…" until the chat loads |
| Sections | Behavior and Audio start open; the others start collapsed; each opens and closes on click |
| Close the settings window while the chat is busy, then reopen | It reopens at once and a reply that was streaming is unaffected |
| Stop the gateway | Within about a minute the character slides out to the side and the strip says "Reconnecting…"; typing still works |
| Start the gateway again | Within 5 s it slides back in, waves and says hi; the strip shows the greeting |
| Launch the app with the gateway down | The stage starts empty with no text, then "Reconnecting…"; no slide-out at launch |
| Launch with the gateway up | The character slides in and waves |
| Ask for something that needs your signature (a draft) | Amber with the bang badge after the reply, until you send the next message or switch conversation |
| An untagged tool (Simulate → confused) | Lime with a question badge and dot eyes while it runs |
| Simulate → tool flavours | Searching, a proud face as the signature lands, then amber approval held after the reply |
| Simulate → away and back | It slides out, then in with a wave 4 s later |
| Debug panel → Renderer 2d, then 2.5d | It swaps live both ways; 2.5d shows a shaded box with a lit front, 2d the flat card |
| Simulate → tool flavours (2.5d) | It reaches behind its back and comes out with a magnifier, then a pen, then holds a stamp after the reply |
| Simulate → tool flavours (2d) | The same items appear in its hand; nothing is missing or broken |
| Simulate → away and back | It slides in spinning round once, waving |
| Let an answer finish | A pirouette with the little hop and sparks |
| Poke it once | It twists a little and springs back |
| Poke it three times | Dizzy: it spins round twice |
| Leave it idle, mouse still, up to 40 s | Now and then it turns to look over a shoulder and back |
| Turn on reduced motion (OS), then tool flavours | Items appear and go without the reach; no spins |
| Leave it idle, mouse moving or still | Within about 3 min it reads in an armchair, has a coffee or waters a plant for 15–30 s, then drifts again; never the same one twice in a row |
| Send a message while it's at a pastime | The pastime's scene sinks and the turn plays; when the turn ends it's plain idle, not back to the pastime |
| Poke it while it's at a pastime | The pastime ends; the next one waits its full interval |
| Customization → Appearance → Scenes off | No furniture for searching, working or sleeping, and no pastimes; on again brings them back; the setting survives a restart |
| Customization → Behavior → Idle activities | Each button starts that pastime; random now starts a different one than the one showing |
| Idle activities → football, watch a few kicks | A goal and a miss each read clearly; the goal stays in view beside Grid; a goal billows the net and Grid turns to us and hops; a miss is fetched |
| Idle activities → jumprope, watch for a trip | The rope passes in front of and behind Grid, a hop over each pass; a trip reads as funny, not as an error |
| Send a message mid-football or mid-rope | The ball and rope sink away with the scene and the hands come down |
| Watch a coffee break and a watering | The cup comes in to the mouth and the mouth opens round for each sip, eyes never covered; the water falls on the pot, not beside it |
