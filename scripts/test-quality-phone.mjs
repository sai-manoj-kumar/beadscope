// Quality gate on a phone (see scripts/quality-gate.mjs). Reads BEADSCOPE_TEST_URL.
import { runQualityGate } from "./quality-gate.mjs";

await runQualityGate("phone");
