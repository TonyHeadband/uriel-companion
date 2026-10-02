import type { RoutineScript } from "../routine";
import { football } from "./football";
import { coffee, reading, watering } from "./pastimes";
import { jumprope } from "./rope";

export type RoutineName = "reading" | "coffee" | "watering" | "football" | "jumprope";

export const ROUTINES: Record<RoutineName, RoutineScript> = { reading, coffee, watering, football, jumprope };
