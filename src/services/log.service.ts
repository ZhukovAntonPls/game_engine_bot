import chalk from 'chalk';
import dedent from 'dedent-js';
import { Params } from '../utils/params';

const printError = (error) => {
  console.log(chalk.bgRed(' ERROR ') + ' ' + error);
};

const printSuccess = (message) => {
  console.log(chalk.bgGreen(' SUCCESS ') + ' ' + message);
};

const printHelp = () => {
  console.log(
    dedent`${chalk.bgCyan(' HELP ')}
        -g Game name [ treasures_fire ]
        -b Bet [ 1 ]
        -n Number of microrounds [ 1000 ]
        -f Buy feature mode [ 0 - disable, 1 - enable ]
        -t Number of threads [ 20 ]
        Example: node ./dist/index.js -g treasures_fire -b 1 -n 1000 -f 0 -t 20 -h
        `,
  );
};

const printParams = (params: Params) => {
  console.log(
    dedent`${chalk.bgBlue(' COLLECT PARAMETERS ')}
        gameName: ${params.gameName}
        bet: ${params.bet}
        microroundCount: ${ +params.microroundCount * +params.threadCount}
        buyFeatureEnabled: ${params.buyFeatureEnabled ? 'true' : 'false'}
        threadCount: ${params.threadCount}
        `,
  );
};

export { printError, printHelp, printSuccess, printParams };
