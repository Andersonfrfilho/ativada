# Conferência independente das métricas (ADR 0002 §"Métricas"): Python puro, só `decimal`, sem bibliotecas.
# Uso: python3 -I metrics_reference.py <entrada.json> <dourado.json> "<nome do conjunto>"
import json
import sys
from decimal import ROUND_HALF_UP, Decimal, getcontext

getcontext().prec = 40
getcontext().rounding = ROUND_HALF_UP
TOLERANCE = Decimal("1e-9")
YEAR_MS = Decimal(31_557_600_000)
MIN_ANNUALIZATION_MS = 30 * 86_400_000
ZERO, ONE = Decimal(0), Decimal(1)


def returns_of(equities):
    return [equities[i] / equities[i - 1] - ONE for i in range(1, len(equities))]


def sample_deviation(values, mean):
    if all(value == values[0] for value in values):
        return ZERO
    return (sum((v - mean) ** 2 for v in values) / (len(values) - 1)).sqrt()


def risk_ratios(equities, timeframe_ms):
    returns = returns_of(equities)
    if len(returns) < 2:
        return None, None
    root = (YEAR_MS / timeframe_ms).sqrt()
    mean = sum(returns) / len(returns)
    deviation = sample_deviation(returns, mean)
    downside = (sum(min(r, ZERO) ** 2 for r in returns) / len(returns)).sqrt()
    sharpe = None if deviation == 0 else mean / deviation * root
    sortino = None if downside == 0 else mean / downside * root
    return sharpe, sortino


def deepest_drawdown(equities, valleys):
    peak, peak_index, best = ZERO, 0, (ZERO, None)
    for index, equity in enumerate(equities):
        if equity >= peak:
            peak, peak_index = equity, index
        depth = (peak - valleys[index]) / peak
        if depth > best[0]:
            best = (depth, (peak_index, index, peak))
    return best


def drawdown(times, equities, valleys):
    depth, where = deepest_drawdown(equities, valleys)
    if where is None:
        return {"depth": ZERO, "peakTime": None, "troughTime": None, "recoveryTime": None, "durationCandles": 0}
    peak_index, trough_index, peak = where
    recovery = next((i for i in range(trough_index, len(equities)) if equities[i] >= peak), None)
    end = len(equities) - 1 if recovery is None else recovery
    return {
        "depth": depth,
        "peakTime": times[peak_index],
        "troughTime": times[trough_index],
        "recoveryTime": None if recovery is None else times[recovery],
        "durationCandles": end - peak_index,
    }


def exposure(times, trades, open_position):
    spans = [(t["openedCandleOpenTime"], t["candleOpenTime"]) for t in trades]
    if open_position is not None:
        spans.append((open_position["openedCandleOpenTime"], float("inf")))
    held = sum(1 for time in times if any(a <= time < b for a, b in spans))
    return Decimal(held) / len(times)


def trade_statistics(trades, open_position):
    nets = [Decimal(t["netProfit"]) for t in trades]
    wins = [n for n in nets if n > 0]
    losses = [n for n in nets if n < 0]
    gross_profit, gross_loss = sum(wins, ZERO), -sum(losses, ZERO)
    streak = longest = 0
    for net in nets:
        streak = streak + 1 if net < 0 else 0
        longest = max(longest, streak)
    fees = sum((Decimal(t["entryFee"]) + Decimal(t["exitFee"]) for t in trades), ZERO)
    if open_position is not None:
        fees += Decimal(open_position["entryFee"])
    return {
        "trades": len(nets), "wins": len(wins), "losses": len(losses), "netProfit": sum(nets, ZERO),
        "grossProfit": gross_profit, "grossLoss": gross_loss, "feesPaid": fees, "maxConsecutiveLosses": longest,
    }


def trade_ratios(stats):
    count, wins, losses = stats["trades"], stats["wins"], stats["losses"]
    if count == 0:
        return {}
    average_win = stats["grossProfit"] / wins if wins else None
    average_loss = stats["grossLoss"] / losses if losses else None
    expectancy = (average_win * (Decimal(wins) / count) if wins else ZERO) - (
        average_loss * (Decimal(losses) / count) if losses else ZERO
    )
    return {
        "winRate": Decimal(wins) / count,
        "profitFactor": None if stats["grossLoss"] == 0 else stats["grossProfit"] / stats["grossLoss"],
        "averageTrade": stats["netProfit"] / count,
        "expectancy": expectancy,
        "averageWin": average_win,
        "averageLoss": average_loss,
        "payoffRatio": None if average_win is None or average_loss is None else average_win / average_loss,
    }


def compute(data):
    points, run = data["equityPoints"], data["run"]
    times = [p["candleOpenTime"] for p in points]
    equities = [Decimal(p["equity"]) for p in points]
    lows = [Decimal(p["equityAtLow"]) for p in points]
    initial, timeframe = Decimal(run["initialBalance"]), run["timeframeMilliseconds"]
    elapsed = times[-1] - times[0]
    ratio = equities[-1] / initial
    benchmark = Decimal(points[-1]["benchmark"]) / initial
    sharpe, sortino = risk_ratios(equities, timeframe)
    stats = trade_statistics(data["closedPositions"], data["openPosition"])
    is_long = elapsed >= MIN_ANNUALIZATION_MS
    metrics = {
        "totalReturn": ratio - ONE, "benchmarkReturn": benchmark - ONE, "excessReturn": ratio - benchmark,
        "annualizedReturn": ratio ** (YEAR_MS / elapsed) - ONE if is_long else None,
        "sharpe": sharpe, "sortino": sortino,
        "tradesPerYear": stats["trades"] / (Decimal(elapsed) / YEAR_MS) if is_long else None,
        "exposure": exposure(times, data["closedPositions"], data["openPosition"]),
        **stats, **trade_ratios(stats),
    }
    return metrics, drawdown(times, equities, equities), drawdown(times, equities, lows)


def golden_value(entry):
    if isinstance(entry, dict) and "value" in entry:
        entry = entry["value"]
    return None if entry is None else Decimal(str(entry))


def compare(label, mine, theirs):
    ok = (mine is None and theirs is None) or (
        mine is not None and theirs is not None and abs(Decimal(mine) - theirs) <= TOLERANCE
    )
    print(f"{'ok  ' if ok else 'DIFF'} {label}: python={mine} golden={theirs}")
    return ok


def main():
    data = json.load(open(sys.argv[1], encoding="utf-8"))
    golden = json.load(open(sys.argv[2], encoding="utf-8"))["datasets"][sys.argv[3]]
    metrics, at_close, at_low = compute(data)
    results = [compare(key, value, golden_value(golden[key])) for key, value in metrics.items() if key in golden]
    for name, mine in (("maxDrawdownAtClose", at_close), ("maxDrawdownAtLow", at_low)):
        theirs = golden[name]
        results.append(compare(f"{name}.depth", mine["depth"], Decimal(theirs["depth"])))
        for field in ("peakTime", "troughTime", "recoveryTime", "durationCandles"):
            results.append(compare(f"{name}.{field}", mine[field], golden_value(theirs[field])))
    print("TODAS AS MÉTRICAS BATEM (tolerância 1e-9)" if all(results) else "DIVERGÊNCIA")
    sys.exit(0 if all(results) else 1)


main()
