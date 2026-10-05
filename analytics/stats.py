"""Statistics for the experiment readout (small, tested, no hidden magic)."""

from __future__ import annotations

import numpy as np
from scipy import stats


def srm_p(n_a: int, n_b: int) -> float:
    """Sample-ratio mismatch: exact binomial test against a 50/50 split."""
    return float(stats.binomtest(n_a, n_a + n_b, 0.5).pvalue)


def log_ratio(a: np.ndarray, b: np.ndarray, seed: int = 0, reps: int = 4000) -> dict:
    """Effect of B vs A on a positive, skewed metric (play time): ratio of geometric means
    of (x + 1), Welch t-test on log(x + 1), bootstrap CI, and P(B > A) under a flat prior
    (normal approximation of the posterior of the difference in log means)."""
    la, lb = np.log1p(a), np.log1p(b)
    diff = lb.mean() - la.mean()
    se = np.sqrt(la.var(ddof=1) / len(la) + lb.var(ddof=1) / len(lb))
    t = stats.ttest_ind(lb, la, equal_var=False)
    rng = np.random.default_rng(seed)
    boot = [np.log1p(rng.choice(b, len(b))).mean() - np.log1p(rng.choice(a, len(a))).mean()
            for _ in range(reps)]
    lo, hi = np.percentile(boot, [2.5, 97.5])
    return {"ratio": float(np.exp(diff)), "ci95": [float(np.exp(lo)), float(np.exp(hi))],
            "p": float(t.pvalue), "p_mannwhitney": float(stats.mannwhitneyu(b, a).pvalue),
            "prob_b_better": float(stats.norm.cdf(diff / se)), "sd_log": float(np.sqrt(
                (la.var(ddof=1) + lb.var(ddof=1)) / 2))}


def proportion(xa: int, na: int, xb: int, nb: int) -> dict:
    """Difference in proportions (B - A), Wald CI, two-sided z-test (pooled)."""
    pa, pb = xa / na, xb / nb
    se = np.sqrt(pa * (1 - pa) / na + pb * (1 - pb) / nb)
    pp = (xa + xb) / (na + nb)
    se0 = np.sqrt(pp * (1 - pp) * (1 / na + 1 / nb)) or 1e-12
    return {"a": pa, "b": pb, "diff": pb - pa, "ci95": [pb - pa - 1.96 * se, pb - pa + 1.96 * se],
            "p": float(2 * stats.norm.sf(abs(pb - pa) / se0))}


def mean_diff(a: np.ndarray, b: np.ndarray) -> dict:
    se = np.sqrt(a.var(ddof=1) / len(a) + b.var(ddof=1) / len(b))
    d = b.mean() - a.mean()
    return {"a": float(a.mean()), "b": float(b.mean()), "diff": float(d),
            "ci95": [float(d - 1.96 * se), float(d + 1.96 * se)],
            "p": float(stats.ttest_ind(b, a, equal_var=False).pvalue)}


def holm(ps: list[float]) -> list[float]:
    order = np.argsort(ps)
    out, running = [0.0] * len(ps), 0.0
    for rank, i in enumerate(order):
        running = max(running, (len(ps) - rank) * ps[i])
        out[i] = min(1.0, running)
    return out


def mde_log(sd: float, n_per_arm: int, alpha: float = 0.05, power: float = 0.8) -> float:
    """Minimum detectable ratio of geometric means for a two-arm test on log scale."""
    z = stats.norm.ppf(1 - alpha / 2) + stats.norm.ppf(power)
    return float(np.exp(z * sd * np.sqrt(2 / n_per_arm)))


def mde_prop(p: float, n_per_arm: int, alpha: float = 0.05, power: float = 0.8) -> float:
    z = stats.norm.ppf(1 - alpha / 2) + stats.norm.ppf(power)
    return float(z * np.sqrt(2 * p * (1 - p) / n_per_arm))
