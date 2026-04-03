const thirtyDaysAgoMs = Date.now() - (30 * 24 * 60 * 60 * 1000);
const binanceUrl = `https://api.binance.com/api/v3/klines?symbol=ETHUSDT&interval=1d&limit=1&endTime=${thirtyDaysAgoMs}`;

fetch(binanceUrl)
  .then(r => r.json())
  .then(data => {
    console.log(data);
    console.log("close price:", parseFloat(data[0][4]));
  });
