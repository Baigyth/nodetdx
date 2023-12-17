const fs = require('fs');
const {TdxFileNotFoundException} = require('./baseReader');
const TdxMinuteBarReader = require('./minuteBarReader');
const {formatDatetime} = require('../helper');

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
      const [year, month, day] = this.parseDate(row[0]);

      result.push({
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
                  });
    }
    return result;
  }

  parseDate(num) {
    // 源码风格
    // const year = Math.floor(num / 10000);
    // const month = Math.floor((num % 10000) / 100);
    // const day = Math.floor((num % 10000) % 100);
    const year = `${num}`.substring(0, 4) * 1;
    const month = `${num}`.substring(4, 6) * 1;
    const day = `${num}`.substring(6, 8) * 1;

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
      if (codeHead === '60') {
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
