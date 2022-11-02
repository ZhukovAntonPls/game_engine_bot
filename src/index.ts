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
      const sumRtp = results.reduce((partialSum, threadRtp) => partialSum + threadRtp, 0);
      printSuccess(`RTP = ${sumRtp / +params.threadCount}%`);
    } catch (err) {
      printError(err);
    }
  }
};

run();
