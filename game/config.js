// Fill in SUPABASE_URL and SUPABASE_ANON_KEY after following docs/SETUP.md.
// The anon key is meant to be public: the database only lets it INSERT events (see
// supabase/schema.sql), never read them.
"use strict";

const CONFIG = {
  GAME_VERSION: "1.0.0",
  SUPABASE_URL: "",       // e.g. "https://abcdefgh.supabase.co"
  SUPABASE_ANON_KEY: "",  // Project Settings -> API -> anon public key

  // The experiment. Assignment is a hash of the anonymous player id, so a player always
  // gets the same arm. Change EXPERIMENT_ID to start a new experiment with fresh assignment.
  EXPERIMENT_ID: "exp1_gentle_start",
  VARIANTS: ["standard", "gentle_start"],
};
