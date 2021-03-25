'use strict';

const crypto = require('crypto');
const csv = require('fast-csv');
const extract = require('extract-zip');
const fs = require('fs-extra');
const http = require('http');
// const {SMTPClient} = require('emailjs');
const {spawn} = require('child_process');
const url = require('url');

const utils = {
  download(src, dist) {
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
        console.log(`download func got error: ${err.message}`);
        reject(err);
      });
    });
  },

  checkMD5(buildFile, buildMD5File) {
    const value = crypto.createHash('md5')
        .update(fs.readFileSync(buildFile)).digest('hex');
    const base = String(fs.readFileSync(buildMD5File));
    return value === base;
  },

  async extractBuild(buildFile, unzipPath) {
    await extract(buildFile, {dir: unzipPath});
  },

  /**
   * Execute command.
   * @param {string} cmd command string.
   * @param {array} args arguments array.
   * @param {string} cwd path string.
   * @param {object} result return value.
   * @return {object} child_process.spawn promise.
   */
  childCommand(cmd, args, cwd, result) {
    return new Promise((resolve, reject) => {
      const child = spawn(cmd, [...args], {cwd: cwd, shell: true});

      child.stdout.on('data', (data) => {
        if (result !== undefined) result.output += data.toString();
      });

      child.stderr.on('data', (data) => {
        if (result !== undefined) result.output += data.toString();
      });

      child.on('close', (code) => {
        resolve(code);
      });
    });
  },

  async saveResultsCSV(csvFile, resultsStr, component) {
    function readyResultsData(dataStr, component) {
      const resultsData = [];
      const dataArray = dataStr.split('\n');
      let tcBlockFlag = false;
      let tcErrorStartIndex;
      let tcName;
      for (let i = 1; i < dataArray.length; i++) {
        if (dataArray[i].startsWith('[ RUN      ]')) {
          console.log(dataArray[i]);
          tcName = dataArray[i].slice('[ RUN      ]'.length + 1);
          tcBlockFlag = true;
          tcErrorStartIndex = i + 1;
        }
        if (tcBlockFlag) {
          if (dataArray[i + 1].startsWith('[       OK ]')) {
            console.log(dataArray[i + 1]);
            resultsData.push([component, tcName, 'PASS']);
            i += 1;
            tcBlockFlag = false;
          } else if (dataArray[i].startsWith('[  FAILED  ]')) {
            console.log(dataArray[i]);
            let msg = '';
            for (let j = tcErrorStartIndex; j < i; j++) {
              msg += dataArray[j] + '\n';
            }
            console.log(msg.trim());
            resultsData.push([component, tcName, 'FAIL', msg.trim()]);
            tcBlockFlag = false;
          }
        }
      }
      if (tcBlockFlag) {
        throw new Error('Run test exception');
      }
      return resultsData;
    }

    const resultsData = readyResultsData(resultsStr, component);

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
};

module.exports = utils;
