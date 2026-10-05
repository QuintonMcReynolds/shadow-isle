// Last Lighthouse settings. Same Supabase project as Shadow Isle: every row is tagged
// game = "last_lighthouse" so the two games' data stays separate (supabase/002_last_lighthouse.sql).
"use strict";

const CONFIG = {
  GAME: "last_lighthouse",
  GAME_VERSION: "lh-1.0.0",
  STORAGE_PREFIX: "lh_",
  SUPABASE_URL: "https://fyrqmnfqpkeryzhquuef.supabase.co",
  SUPABASE_ANON_KEY: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ5cnFtbmZxcGtlcnl6aHF1dWVmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTExNjU3MzQsImV4cCI6MjEwNjc0MTczNH0.boPKHG09To8RY1vHu6DRSdeXJlqWmr8kpRF_FC8rw3I",

  // Experiment: does a nudge (Cuetip thinks out loud after 75 s without progress) help
  // players finish? Assignment is a hash of the anonymous player id, sticky per player.
  EXPERIMENT_ID: "lh1_hint_nudge",
  VARIANTS: ["standard", "nudge"],
};
