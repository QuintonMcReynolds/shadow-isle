import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "analytics"))
import stats as st


def test_srm():
    assert st.srm_p(500, 500) > 0.9
    assert st.srm_p(560, 440) < 0.001


def test_log_ratio_recovers_multiplicative_effect():
    rng = np.random.default_rng(0)
    a = np.exp(rng.normal(4, 1, 4000)) - 1
    b = np.exp(rng.normal(4 + np.log(1.3), 1, 4000)) - 1
    r = st.log_ratio(a, b, reps=500)
    assert 1.22 < r["ratio"] < 1.38
    assert r["ci95"][0] < 1.3 < r["ci95"][1]
    assert r["prob_b_better"] > 0.99


def test_log_ratio_null_is_calibrated():
    rng = np.random.default_rng(1)
    rejections = 0
    for _ in range(300):
        a = np.exp(rng.normal(4, 1, 80)) - 1
        b = np.exp(rng.normal(4, 1, 80)) - 1
        rejections += st.log_ratio(a, b, reps=50)["p"] < 0.05
    assert rejections / 300 < 0.09


def test_proportion_and_holm():
    r = st.proportion(30, 100, 45, 100)
    assert abs(r["diff"] - 0.15) < 1e-12 and r["p"] < 0.05
    assert st.holm([0.01, 0.04, 0.03]) == [0.03, 0.06, 0.06]


def test_mde_shrinks_with_sample_size():
    assert st.mde_log(1.0, 400) < st.mde_log(1.0, 100) < st.mde_log(1.0, 50)
