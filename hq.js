const childProcess = require('child_process');
const path = require('path');
const BaseSocketClient = require('./baseSocketClient');
const {
  SetupCmd1,
  SetupCmd2,
  SetupCmd3
} = require('./parser/setupCommands');
const GetSecurityCountCmd = require('./parser/getSecurityCount');
const GetSecurityList = require('./parser/getSecurityList');
const GetSecurityQuotesCmd = require('./parser/getSecurityQuotes');
const GetFinanceInfo = require('./parser/getFinanceInfo');
const GetExRightInfo = require('./parser/getExRightInfo');
const GetSecurityBarsCmd = require('./parser/getSecurityBars');
const GetIndexBarsCmd = require('./parser/getIndexBars');
const GetMinuteTimeData = require('./parser/getMinuteTimeData');
const GetHistoryMinuteTimeData = require('./parser/getHistoryMinuteTimeData');
const GetHistoryTransactionData = require('./parser/getHistoryTransactionData');
const GetTransactionData = require('./parser/getTransactionData');
const GetCompanyInfoCategory = require('./parser/getCompanyInfoCategory');
const GetCompanyInfoContent = require('./parser/getCompanyInfoContent');

const { marketHosts } = require('./config/hosts');
const { parseSymbol, getMarketId, getPeriodValue, calcStartTimestamp, calcEndTimestamp } = require('./helper');

let Worker;
try {
  const workerThreads = require('worker_threads');
  Worker = workerThreads.Worker;
}
catch (e) {}

const marketIds = ['SH', 'SZ', 'BJ'];
class TdxMarketApi extends BaseSocketClient {

  doPing() {
    return this.getGateways(marketHosts);
  }

  doHeartbeat() {
    return this.getSecurityCount(marketIds[Math.round(Math.random())]);
  }

  async setup() {
    await new SetupCmd1(this.client).callApi();
    await new SetupCmd2(this.client).callApi();
    await new SetupCmd3(this.client).callApi();
  }

  // api list
  async getSecurityCount(marketId) {
    const cmd = new GetSecurityCountCmd(this.client);
    cmd.setParams(getMarketId(marketId));
    return await cmd.callApi();
  }

  async getSecurityList(marketId, start) {
    const cmd = new GetSecurityList(this.client);
    cmd.setParams(getMarketId(marketId), start);
    return await cmd.callApi();
  }

  /**
   * symbols的长度最大为80, 若超过80只股票则只查询前80只股票的quote
   * @param  {...any} symbols
   * ...symbols: 三种形式
   * '000001.SZ'
   * ['000001.SZ', '600519.SZ']
   * '000001.SZ', '600519.SZ'
   */
  async getSecurityQuotes(...symbols) {
    let params;
    if (symbols.length === 1) {
      const firstArg = symbols[0];
      if (typeof firstArg === 'string') {
        const { marketId, code } = parseSymbol(firstArg);
        params = [[ marketId, code ]];
      }
      else if (Array.isArray(firstArg)) {
        params = firstArg.map(arg => {
          const { marketId, code } = parseSymbol(arg);
          return [ marketId, code ];
        });
      }
    }
    else {
      params = symbols.map(arg => {
        const { marketId, code } = parseSymbol(arg);
        return [ marketId, code ];
      });
    }

    const cmd = new GetSecurityQuotesCmd(this.client);
    cmd.setParams(params);
    return await cmd.callApi();
  }

  async getFinanceInfo(symbol) {
    const { code, marketId } = parseSymbol(symbol);
    const cmd = new GetFinanceInfo(this.client);
    cmd.setParams(marketId, code);
    return await cmd.callApi();
  }

  async getExRightInfo(symbol) {
    const { code, marketId } = parseSymbol(symbol);
    const cmd = new GetExRightInfo(this.client);
    cmd.setParams(marketId, code);
    return await cmd.callApi();
  }

  async getSecurityBars(period, symbol, start, count) {
    const { code, marketId } = parseSymbol(symbol);
    const cmd = new GetSecurityBarsCmd(this.client);
    cmd.setParams(getPeriodValue(period), marketId, code, start, count);
    return await cmd.callApi();
  }

  async getIndexBars(period, symbol, start, count) {
    const { code, marketId } = parseSymbol(symbol);
    const cmd = new GetIndexBarsCmd(this.client);
    cmd.setParams(getPeriodValue(period), marketId, code, start, count);
    return await cmd.callApi();
  }

  async getMinuteTimeData(symbol) {
    const { code, marketId } = parseSymbol(symbol);
    const cmd = new GetMinuteTimeData(this.client);
    cmd.setParams(marketId, code);
    return await cmd.callApi();
  }

  async getHistoryMinuteTimeData(symbol, date) {
    const { code, marketId } = parseSymbol(symbol);
    const cmd = new GetHistoryMinuteTimeData(this.client);
    cmd.setParams(marketId, code, date);
    return await cmd.callApi();
  }

  async getTransactionData(symbol, start, count) {
    const { code, marketId } = parseSymbol(symbol);
    const cmd = new GetTransactionData(this.client);
    cmd.setParams(marketId, code, start, count);
    return await cmd.callApi();
  }

  async getHistoryTransactionData(symbol, start, count, date) {
    const { code, marketId } = parseSymbol(symbol);
    const cmd = new GetHistoryTransactionData(this.client);
    cmd.setParams(marketId, code, start, count, date);
    return await cmd.callApi();
  }

  async getCompanyInfoCategory(symbol) {
    const { code, marketId } = parseSymbol(symbol);
    const cmd = new GetCompanyInfoCategory(this.client);
    cmd.setParams(marketId, code);
    return await cmd.callApi();
  }

  async getCompanyInfoContent(symbol, filename, start, length) {
    const { code, marketId } = parseSymbol(symbol);
    const cmd = new GetCompanyInfoContent(this.client);
    cmd.setParams(marketId, code, filename, start, length);
    return await cmd.callApi();
  }

  /**
   * 按日期查询count根证券K线
   * 若有startDatetime、count 且无 endDatetime, 则返回startDatetime之后的count根K线
   * 若有endDatetime、count 且无 startDatetime, 则返回endDatetime之前的count根K线
   * 若有startDatetime、endDatetime 且无 count, 则返回startDatetime和endDatetime之间的K线
   * 若有startDatetime 且无 endDatetime、count, 则返回startDatetime到当前时间之间的K线
   * @param {String} period 1m, 15m, 30m, H, D, W, M, Q, Y
   * @param {String} symbol
   * @param {String} startDatetime
   * @param {String} endDatetime
   * @param {Integer} count
   */
  async findSecurityBars(period = 'D', symbol, startDatetime, endDatetime, count) {
    // 具体详情参见 https://github.com/rainx/pytdx/issues/5
    // 具体详情参见 https://github.com/rainx/pytdx/issues/21

    // https://github.com/rainx/pytdx/issues/33
    // 0 - 深圳， 1 - 上海

    let startTimestamp, endTimestamp;

    if (startDatetime) {
      startTimestamp = calcStartTimestamp(startDatetime);
    }

    if (endDatetime) {
      endTimestamp = calcEndTimestamp(endDatetime);
    }

    let bars = [];
    let i = 0;
    while(true) {
      let list = await this.getSecurityBars(period, symbol, i++ * 700, 700); // i++ * 8 => i * 8; i++;

      if (!list || !list.length) {
        break;
      }

      if (list.length) {
        const firstBar = list[0];
        const lastBar = list[list.length - 1];
        const firstTimestamp = new Date(firstBar.datetime).getTime();
        const lastTimestamp = new Date(lastBar.datetime).getTime();

        if (endTimestamp && firstTimestamp >= endTimestamp) {
          continue;
        }

        if (startTimestamp && startTimestamp > lastTimestamp) {
          break;
        }

        list = list.filter(bar => {
          const timestamp = new Date(bar.datetime).getTime();
          if (startTimestamp && endTimestamp) {
            return timestamp >= startTimestamp && timestamp <= endTimestamp;
          }
          else if (startTimestamp) {
            return timestamp >= startTimestamp;
          }
          else if (endTimestamp) {
            return timestamp <= endTimestamp;
          }
        });
        bars = list.concat(bars);

        if (!startTimestamp && endTimestamp && count && count > 0 && bars.length >= count) {
          break;
        }
      }
    }

    if (startTimestamp && endTimestamp) {
      return count && count > 0 ? bars.slice(0, count) : bars;
    }
    else if (startTimestamp) {
      return count && count > 0 ? bars.slice(0, count) : bars;
    }
    else if (endTimestamp) {
      return count && count > 0 ? bars.slice(-count) : bars;
    }

    return bars;
  }

  /**
   * 按日期查询count根指数K线
   * 若有startDatetime、count 且无 endDatetime, 则返回startDatetime之后的count根K线
   * 若有endDatetime、count 且无 startDatetime, 则返回endDatetime之前的count根K线
   * 若有startDatetime、endDatetime 且无 count, 则返回startDatetime和endDatetime之间的K线
   * 若有startDatetime 且无 endDatetime、count, 则返回startDatetime到当前时间之间的K线
   * @param {String} period 1m, 15m, 30m, H, D, W, M, Q, Y
   * @param {String} symbol
   * @param {String} startDatetime
   * @param {String} endDatetime
   * @param {Integer} count
   */
  async findIndexBars(period = 'D', symbol, startDatetime, endDatetime, count) {
    // 具体详情参见 https://github.com/rainx/pytdx/issues/5
    // 具体详情参见 https://github.com/rainx/pytdx/issues/21

    // https://github.com/rainx/pytdx/issues/33
    // 0 - 深圳， 1 - 上海

    let startTimestamp, endTimestamp;

    if (startDatetime) {
      startTimestamp = calcStartTimestamp(startDatetime);
    }

    if (endDatetime) {
      endTimestamp = calcEndTimestamp(endDatetime);
    }

    let bars = [];
    let i = 0;
    while(true) {
      let list = await this.getIndexBars(period, symbol, i++ * 700, 700); // i++ * 8 => i * 8; i++;

      if (!list || !list.length) {
        break;
      }

      if (list.length) {
        const firstBar = list[0];
        const lastBar = list[list.length - 1];
        const firstTimestamp = new Date(firstBar.datetime).getTime();
        const lastTimestamp = new Date(lastBar.datetime).getTime();

        if (endTimestamp && firstTimestamp >= endTimestamp) {
          continue;
        }

        if (startTimestamp && startTimestamp > lastTimestamp) {
          break;
        }

        list = list.filter(bar => {
          const timestamp = new Date(bar.datetime).getTime();
          if (startTimestamp && endTimestamp) {
            return timestamp >= startTimestamp && timestamp <= endTimestamp;
          }
          else if (startTimestamp) {
            return timestamp >= startTimestamp;
          }
          else if (endTimestamp) {
            return timestamp <= endTimestamp;
          }
        });
        bars = list.concat(bars);

        if (!startTimestamp && endTimestamp && count && count > 0 && bars.length >= count) {
          break;
        }
      }
    }

    if (startTimestamp && endTimestamp) {
      return count && count > 0 ? bars.slice(0, count) : bars;
    }
    else if (startTimestamp) {
      return count && count > 0 ? bars.slice(0, count) : bars;
    }
    else if (endTimestamp) {
      return count && count > 0 ? bars.slice(-count) : bars;
    }

    return bars;
  }

  /**
   * 按日期查询count根K线
   * 若有startDatetime、count 且无 endDatetime, 则返回startDatetime之后的count根K线
   * 若有endDatetime、count 且无 startDatetime, 则返回endDatetime之前的count根K线
   * 若有startDatetime、endDatetime 且无 count, 则返回startDatetime和endDatetime之间的K线
   * 若有startDatetime 且无 endDatetime、count, 则返回startDatetime到当前时间之间的K线
   * 不再区分是指数还是股票, 由程序解析symbol来自动区分, 对调用者屏蔽差异
   * 注: 这里有个问题 因为tdx的官网的最大显示就是24000条 所以1min和5min数据 最多只能取24000条左右 这个没法再多了 其他的没啥影响
   * @param {String} period 1m, 15m, 30m, H, D, W, M, Q, Y
   * @param {String} symbol
   * @param {String} startDatetime
   * @param {String} endDatetime
   * @param {Integer} count
   */
  findBars(period = 'D', symbol, startDatetime, endDatetime, count) {
    const { isIndex } = parseSymbol(symbol);
    return isIndex ? this.findIndexBars(period, symbol, startDatetime, endDatetime, count) : this.findSecurityBars(period, symbol, startDatetime, endDatetime, count);
  }

  /**
   * 订阅函数会创建子进程不断的调用methodName指定的方法
   * @param {Array} args
   * args = [methodName, ...actualArgs, callback]
   */
  subscribe(...args) {
    const methodName = args.shift();
    const callback = args.pop();

    if (!this[methodName] || typeof this[methodName] !== 'function') {
      throw new Error('first argument of subscribe must be an existing function name.');
    }

    if (typeof callback !== 'function') {
      throw new Error('last argument of subscribe must be a function.');
    }

    let child;
    // 支持线程则使用线程
    if (Worker) {
      child = new Worker(path.join(__dirname, './hqWorker.js'));
      child.postMessage([ methodName, args, this.host, this.port ]);
    }
    // 不支持线程则使用进程
    else {
      child = childProcess.fork(path.join(__dirname, './hqChildProcess.js'), [ methodName, args, this.host, this.port ], { stdio: [ 'pipe', 'pipe', 'pipe', 'ipc' ] });
    }

    child.on('message', data => {
      callback(data);
    });

    return child;
  }

  /**
   * 订阅quotes函数会创建子进程不断的调用getSecurityQuotes
   * @param {Array} args
   * args = [...actualArgs, callback]
   */
  subscribeQuotes(...args) {
    const callback = args.pop();

    if (typeof callback !== 'function') {
      throw new Error('last argument of subscribe must be a function.');
    }

    let child;
    // 支持线程则使用线程
    if (Worker) {
      child = new Worker(path.join(__dirname, './subscribeQuotesWorker.js'));
      child.postMessage([ args, this.host, this.port ]);
    }
    // 不支持线程则使用进程
    else {
      child = childProcess.fork(path.join(__dirname, './subscribeQuotesChildProcess.js'), [ args, this.host, this.port ], { stdio: [ 'pipe', 'pipe', 'pipe', 'ipc' ] });
    }

    child.on('message', data => {
      callback(data);
    });

    return child;
  }

  async findStockList(marketId) {
    if (marketId) {
      const list = [], step = 1000;
      const regMap = {
        SH: /^6[08]\d{4}$/,
        SZ: /^(00|30)\d{4}$/,
        BJ: /^(8[37]|43)\d{4}$/
      };
      const reg = regMap[marketId];

      let i = 0, tmpList;

      do {
        tmpList = await this.getSecurityList(marketId, i++ * step);
        tmpList.forEach(item => {
          if (reg.test(item.code)) {
            item.symbol = marketId + '.' + item.code;
            list.push(item);
          }
        });
      }
      while(tmpList.length);

      return list;
    }
    else {
      return [ ...await this.findStockList('SH'), ...await this.findStockList('SZ'), ...await this.findStockList('BJ') ]; // todo 自定义
    }
  }

}

Object.getOwnPropertyNames(TdxMarketApi.prototype).forEach(name => {
  const property = TdxMarketApi.prototype[name];
  if (typeof property === 'function' && /^get/.test(name)) {
    TdxMarketApi.prototype[name] = new Proxy(
      property,
      {
        apply (target, thisArg, argumentsList) {
          return new Promise((resolve, reject) => {
            thisArg.reqQueue.push([resolve, reject, target, thisArg, argumentsList]);
            thisArg.checkQueue();
          });
        }
      }
    )
  }
});

module.exports = TdxMarketApi;
