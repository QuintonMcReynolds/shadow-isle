// Fill in SUPABASE_URL and SUPABASE_ANON_KEY after following docs/SETUP.md.
// The anon key is meant to be public: the database only lets it INSERT events (see
// supabase/schema.sql), never read them.
"use strict";

const CONFIG = {
  GAME_VERSION: "1.0.0",
  SUPABASE_URL: "https://fyrqmnfqpkeryzhquuef.supabase.co",
  SUPABASE_ANON_KEY: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ5cnFtbmZxcGtlcnl6aHF1dWVmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTExNjU3MzQsImV4cCI6MjEwNjc0MTczNH0.boPKHG09To8RY1vHu6DRSdeXJlqWmr8kpRF_FC8rw3I",  // Project Settings -> API Keys -> publishable key (sb_publishable_...)

  // The experiment. Assignment is a hash of the anonymous player id, so a player always
  // gets the same arm. Change EXPERIMENT_ID to start a new experiment with fresh assignment.
  EXPERIMENT_ID: "exp1_gentle_start",
  VARIANTS: ["standard", "gentle_start"],
};
