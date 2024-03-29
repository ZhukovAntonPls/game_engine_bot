import { getArgs, getArgValue } from './utils/args';
import { CollectorService } from './services/collector.service';
import { printError, printHelp, printParams, printSuccess } from './services/log.service';
import { Params } from './utils/params';

const run = async () => {
  const args = getArgs(process.argv);

  if (args.h) {
    printHelp();
  } else {
    try {
      const threadCount = getArgValue('t', args.t, 1, false) as number;
      const params: Params = {
        gameName: getArgValue('g', args.g, '', true) as string,
        bet: getArgValue('b', args.b, 1, true) as number,
        microroundCount: Math.floor(+getArgValue('n', args.n, 100, true) / threadCount),
        threadCount,
        buyFeatureEnabled: getArgValue('n', args.f, 0, false) === 1 ? true : false,
      };

      printParams(params);
      const threadResultArray = [...Array(+params.threadCount).keys()]
        .map((threadNumber) => {
          return new CollectorService(params).play(threadNumber);
        })
        .flat();

      const results = await Promise.all(threadResultArray);
      const totalSumRtp = results.reduce((partialSum, threadRtp) => partialSum + threadRtp.totalRTP, 0);
      const fsSumRtp = results.reduce((partialSum, threadRtp) => partialSum + threadRtp.freeGameRTP, 0);
      const bonusSumRtp = results.reduce((partialSum, threadRtp) => partialSum + threadRtp.bonusGameRTP, 0);
      const mainSumRtp = results.reduce((partialSum, threadRtp) => partialSum + threadRtp.mainGameRTP, 0);
      const ruleSumRtp = results.reduce((partialSum, threadRtp) => partialSum + threadRtp.ruleRTP, 0);
      printSuccess(`Total RTP = ${totalSumRtp / +params.threadCount}%`);
      printSuccess(`Main RTP = ${mainSumRtp / +params.threadCount}%`);
      printSuccess(`FS RTP = ${fsSumRtp / +params.threadCount}%`);
      printSuccess(`Bonus RTP = ${bonusSumRtp / +params.threadCount}%`);
      printSuccess(`Rule RTP = ${ruleSumRtp / +params.threadCount}%`);
    } catch (err) {
      printError(err);
    }
  }
};

run();
