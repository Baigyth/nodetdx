const fs = require('fs');
const util = require('util');
const readFile = util.promisify(fs.readFile); // 比fs.promises快10%
const {TdxFileNotFoundException} = require('./baseReader');
const TdxMinuteBarReader = require('./minuteBarReader');
const {formatDatetime, calcEndTimestamp, calcStartTimestamp} = require('../helper');

class TdxExchangeNotFoundException extends Error {}

class TdxSecurityTypeNotFoundException extends Error {}

class TdxDailyBarReader extends TdxMinuteBarReader {

  static SECURITY_EXCHANGE = ['sz', 'sh', 'bj'];
  static SECURITY_TYPE = ['SH_A_STOCK', 'SH_B_STOCK', 'SH_INDEX', 'SH_FUND', 'SH_BOND', 'SZ_A_STOCK', 'SZ_B_STOCK', 'SZ_INDEX', 'SZ_FUND', 'SZ_BOND', 'BJ_A_STOCK'];
  static SECURITY_COEFFICIENT = {
    'SH_A_STOCK': [0.01, 0.01],
    'SH_B_STOCK': [0.001, 0.01],
    'SH_INDEX': [0.01, 1.0],
    'SH_FUND': [0.001, 1.0],
    'SH_BOND': [0.001, 1.0],
    'SZ_A_STOCK': [0.01, 0.01],
    'SZ_B_STOCK': [0.01, 0.01],
    'SZ_INDEX': [0.01, 1.0],
    'SZ_FUND': [0.001, 0.01],
    'SZ_BOND': [0.001, 0.01],
    'BJ_A_STOCK': [0.01, 0.01]
  };

  // 读取通达信日线数据
  parseDataFromFile(filename) {
    if (!fs.existsSync(filename)) {
      throw new TdxFileNotFoundException(`no tdx kline data, please check path ${filename}`);
    }
    const securityType = this.getSecurityType(filename);

    if (!securityType || !TdxDailyBarReader.SECURITY_TYPE.includes(securityType)) {
      throw new TdxSecurityTypeNotFoundException('Unknown security type!');
    }
    const coefficient = TdxDailyBarReader.SECURITY_COEFFICIENT[securityType];
    const content = fs.readFileSync(filename);
    const rawList = this.unpackRecords('<IIIIIfII', content);
    const result = [];
    for (const row of rawList) {
      result.push(this.#parseDataFromRow(row, coefficient));
    }
    return result;
  }

  #parseDataFromRow(row, coefficient) {
    const [year, month, day] = this.parseDate(row[0]);
    return {
      datetime: formatDatetime(year, month, day, 'yyyy-MM-dd'),
      year,
      month,
      day,
      open: Number((row[1] * coefficient[0]).toFixed(2)),
      high: Number((row[2] * coefficient[0]).toFixed(2)),
      low: Number((row[3] * coefficient[0]).toFixed(2)),
      close: Number((row[4] * coefficient[0]).toFixed(2)),
      amount: Number(row[5].toFixed(2)),
      volume: row[6] / 100 // 多少手
      // unknown: row[8]
    };
  }

  /**
   * 按日期查询count根证券K线
   * 若有startDatetime、count 且无 endDatetime, 则返回startDatetime之后的count根K线
   * 若有endDatetime、count 且无 startDatetime, 则返回endDatetime之前的count根K线
   * 若有startDatetime、endDatetime 且无 count, 则返回startDatetime和endDatetime之间的K线
   * 若有startDatetime 且无 endDatetime、count, 则返回startDatetime到当前时间之间的K线
   * @param {String} filename
   * @param {String} startDatetime
   * @param {String} endDatetime
   * @param {Number} count
   */
  async findSecurityBars(filename, startDatetime, endDatetime, count) {

    let startTimestamp, endTimestamp;

    if (startDatetime) {
      startTimestamp = calcStartTimestamp(startDatetime);
    }

    if (endDatetime) {
      endTimestamp = calcEndTimestamp(endDatetime);
    }
    if (!fs.existsSync(filename)) {
      throw new TdxFileNotFoundException(`no tdx kline data, please check path ${filename}`);
    }
    const securityType = this.getSecurityType(filename);

    if (!securityType || !TdxDailyBarReader.SECURITY_TYPE.includes(securityType)) {
      throw new TdxSecurityTypeNotFoundException('Unknown security type!');
    }
    const coefficient = TdxDailyBarReader.SECURITY_COEFFICIENT[securityType];

    return readFile(filename, (err, data) => err ? [] : data).then(content => {
      if (content.length === 0) return [];

      return new Promise(res => {
        let bars = [];
        while (true) {
          let list = this.unpackRecords('<IIIIIfII', content);

          if (!list || !list.length) {
            break;
          }

          if (list.length) {
            list = list.map(k => this.#parseDataFromRow(k, coefficient));
            const firstBar = list[0];
            const lastBar = list[list.length - 1];
            const firstTimestamp = new Date(firstBar.datetime).getTime();
            const lastTimestamp = new Date(lastBar.datetime).getTime();
            if (!startDatetime && !endDatetime && count > 0) {
              startTimestamp = 0;
              endTimestamp = lastTimestamp;
            }
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
              } else if (startTimestamp) {
                return timestamp >= startTimestamp;
              } else if (endTimestamp) {
                return timestamp <= endTimestamp;
              }
            });
            bars = list.concat(bars);

            if (!startTimestamp && endTimestamp && count && count > 0 && bars.length >= count) {
              break;
            }
          }
          break;
        }

        if (startTimestamp && endTimestamp) {
          res(count && count > 0 ? bars.slice(0, count) : bars);
        } else if (startTimestamp) {
          res(count && count > 0 ? bars.slice(0, count) : bars);
        } else if (endTimestamp) {
          res(count && count > 0 ? bars.slice(-count) : bars);
        }

        res(bars);
      });
    });

  }

  parseDate(num) {
    const year = Math.floor(num / 10000);
    const month = Math.floor((num % 10000) / 100);
    const day = Math.floor((num % 10000) % 100);

    return [year, month, day];
  }

  getSecurityType(filename) {
    const exchange = filename.substring(filename.length - 12, filename.length - 10);
    const codeHead = filename.substring(filename.length - 10, filename.length - 8);
    if (exchange === TdxDailyBarReader.SECURITY_EXCHANGE[0]) {
      if (codeHead === '00' || codeHead === '30') {
        return 'SZ_A_STOCK';
      }
      if (codeHead === '20') {
        return 'SZ_B_STOCK';
      }
      if (codeHead === '39') {
        return 'SZ_INDEX';
      }
      if (codeHead === '15' || codeHead === '16') {
        return 'SZ_FUND';
      }
      if (['10', '11', '12', '13', '14'].includes(codeHead)) {
        return 'SZ_BOND';
      }
    } else if (exchange === TdxDailyBarReader.SECURITY_EXCHANGE[1]) {
      if (codeHead === '60' || codeHead === '68') {
        return 'SH_A_STOCK';
      }
      if (codeHead === '90') {
        return 'SH_B_STOCK';
      }
      if (codeHead === '00' || codeHead === '88' || codeHead === '99') {
        return 'SH_INDEX';
      }
      if (codeHead === '50' || codeHead === '51') {
        return 'SH_FUND';
      }
      if (['01', '10', '11', '12', '13', '14'].includes(codeHead)) {
        return 'SH_BOND';
      }
    } else if (exchange === TdxDailyBarReader.SECURITY_EXCHANGE[2]) {
      if (codeHead === '83' || codeHead === '87' || codeHead === '43') {
        return 'BJ_A_STOCK';
      }
    } else {
      throw new TdxExchangeNotFoundException('Unknown security exchange!');
    }
    return '';
  }

}

module.exports = TdxDailyBarReader;
