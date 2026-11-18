// Quality gate on a desktop (see scripts/quality-gate.mjs). Reads BEADSCOPE_TEST_URL.
import { runQualityGate } from "./quality-gate.mjs";

await runQualityGate("desktop");
