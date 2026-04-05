# Trading Data Sources

## Free APIs
- **Finnhub**: `https://finnhub.io/api/v1/quote?symbol=AAPL` (free tier)
- **Alpha Vantage**: `https://www.alphavantage.co/query?function=TIME_SERIES_DAILY&symbol=IBM`
- **Polygon.io**: Free tier stocks/options

## Options Greeks (Black-Scholes)
```javascript
function blackScholes(S, K, T, r, sigma, type='call') {
  // Implementation here
}
```

## Chart.js Trading Example
```javascript
const ctx = document.getElementById('chart');
new Chart(ctx, {
  type: 'candlestick',
  data: { datasets: [{ label: 'SPY', data: candleData }] }
});
```