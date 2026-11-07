import assert from "node:assert/strict";
import { createApp } from "@toolgrain/react";

assert.equal(typeof createApp().AppProvider, "function");
assert.equal(typeof createApp().useToolCall, "function");
