'use strict';

const crypto = require('crypto');
const csv = require('fast-csv');
const extract = require('extract-zip');
const fs = require('fs-extra');
const http = require('http');
const {spawn} = require('child_process');
const url = require('url');

const utils = {
  /**
   * Download.
   * @param {object} logger - The logger.
   * @param {src} src - The download file url.
   * @param {dist} dist - The save file.
   * @return {object} promise.
   */
  download(logger, src, dist) {
    return new Promise((resolve, reject) => {
      const buildUrl = new url.URL(src);
      const options = {
        host: buildUrl.host,
        path: buildUrl.pathname,
        port: 80,
      };
      const files = fs.createWriteStream(dist);
      http.get(options, (res) => {
        res.on('data', (data) => {
          files.write(data);
        });
        res.on('end', () => {
          files.end();
          resolve(files);
        });
      }).on('error', (err) => {
        logger.error(`Error: failed to download ${src}: ${err.message}`);
        reject(err);
      });
    });
  },

  /**
   * Check MD5.
   * @param {object} logger - The logger.
   * @param {string} buildFile - The checking build file.
   * @param {string} buildMD5File - The file has MD5 value for checking.
   * @return {string} check status string, value: 'SUCCEEDED' / 'FAILED'
   */
  checkMD5(logger, buildFile, buildMD5File) {
    const value = crypto.createHash('md5')
        .update(fs.readFileSync(buildFile)).digest('hex');
    const base = String(fs.readFileSync(buildMD5File));
    const status = value === base ? 'SUCCEEDED' : 'FAILED';
    logger.info(
        `Checking md5: ${value}, original md5: ${base}, status: ${status}`);
    return status;
  },

  async extractBuild(logger, buildFile, unzipPath) {
    logger.info(`Extract ${buildFile} to ${unzipPath} directory`);
    await extract(buildFile, {dir: unzipPath});
  },

  /**
   * Execute command.
   * @param {object} logger - The logger.
   * @param {string} cmd - The command string.
   * @param {array} args - The arguments array.
   * @param {string} cwd - The path string.
   * @param {object} result - The return value.
   * @return {object} child_process.spawn promise.
   */
  childCommand(logger, cmd, args, cwd, result) {
    logger.info(`Execute commad: ${cmd} ${[...args].join(' ')}`);
    return new Promise((resolve, reject) => {
      const child = spawn(cmd, [...args], {cwd: cwd, shell: true});

      child.stdout.on('data', (data) => {
        if (result !== undefined) {
          logger.info(data.toString());
          result.output += data.toString();
        }
      });

      child.stderr.on('data', (data) => {
        if (result !== undefined) {
          logger.info(data.toString());
          result.output += data.toString();
        }
      });

      child.on('close', (code) => {
        resolve(code);
      });
    });
  },

  /**
   * Save results to CSV file.
   * @param {object} logger - The logger.
   * @param {string} csvFile - The save CSV file.
   * @param {string} resultsStr - The test results string.
   * @param {string} component - The component name.
   * @param {string} example - The example name.
   */
  async saveResultsCSV(logger, csvFile, resultsStr, component, example) {
    function readyResultsData(dataStr, component, example) {
      const resultsData = [];
      if (component !== 'Examples') {
        const dataArray = dataStr.split('\n');
        let tcBlockFlag = false;
        let tcErrorStartIndex;
        let tcName;
        for (let i = 1; i < dataArray.length; i++) {
          if (dataArray[i].startsWith('[ RUN      ]')) {
            tcName = dataArray[i].slice('[ RUN      ]'.length + 1);
            tcBlockFlag = true;
            tcErrorStartIndex = i + 1;
          }
          if (tcBlockFlag) {
            if (dataArray[i + 1].startsWith('[       OK ]')) {
              resultsData.push([component, tcName, 'PASS']);
              i += 1;
              tcBlockFlag = false;
            } else if (dataArray[i].startsWith('[  FAILED  ]')) {
              let msg = '';
              for (let j = tcErrorStartIndex; j < i; j++) {
                msg += dataArray[j] + '\n';
              }
              resultsData.push([component, tcName, 'FAIL', msg.trim()]);
              tcBlockFlag = false;
            }
          }
        }
        if (tcBlockFlag) {
          throw new Error('Run test exception');
        }
      } else {
        if (resultsStr.indexOf('Done') !== -1) {
          resultsData.push([component, example, 'PASS', resultsStr.trim()]);
        } else {
          resultsData.push([component, example, 'FAIL', resultsStr.trim()]);
        }
      }
      return resultsData;
    }

    const resultsData = readyResultsData(resultsStr, component, example);

    if (!fs.existsSync(csvFile)) {
      const writeFile = await fs.createWriteStream(csvFile);
      csv.writeToStream(writeFile, resultsData,
          {headers: ['Component', 'TestCase', 'Result', 'Note']});
    } else {
      const updateFile = fs.createWriteStream(csvFile, {flags: 'a'});
      updateFile.write('\n');
      csv.writeToStream(updateFile, resultsData, {headers: false});
    }
  },

  /**
   * Upload results file.
   * @param {object} logger - The logger.
   * @param {string} result - The report csv file or log file.
   * @param {string} remoteUserHost - The remote user host.
   * @param {string} remoteDir - The remote directory.
   * @param {string} cwd - The path string.
   */
  async uploadResults(logger, result, remoteUserHost, remoteDir, cwd) {
    await this.childCommand(logger, 'ssh',
        [remoteUserHost, 'mkdir', '-p', remoteDir], cwd);
    await this.childCommand(logger, 'scp',
        [`${result} ${remoteUserHost}:${remoteDir}`], cwd);
  },
};

module.exports = utils;
