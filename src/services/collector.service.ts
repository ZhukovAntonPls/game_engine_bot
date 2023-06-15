import { GameEngineAsyncClient } from '@playson-dev/xplatform-game-engine-proto/nest/client/v1';
import { GameEngineServiceClient, GameMode, Status } from '@playson-dev/xplatform-game-engine-proto/client/v1';
import {
  GAME_ENGINE_ADDRESS,
  GAME_ENGINE_BET_MAX_RETRY_TIME, GAME_ENGINE_BET_RETRY_COUNT,
  GAME_ENGINE_BET_RETRY_MAX_TIMEOUT,
  GAME_ENGINE_BET_RETRY_MIN_TIMEOUT
} from '../config/config';
import { credentials } from '@grpc/grpc-js';
import { getGrpcClientOptions } from '@playson-dev/grpc-utils/lib/grpc-client-utils';
import { Params } from '../utils/params';
import { BetResponse } from '@playson-dev/xplatform-game-engine-proto/client/v1/game_engine';
import promiseRetry from "@playson-dev/promise-retry";
import { parseXml } from "../utils/xml.utils";

const sessionId = '1';
const zeroBetStates = ['free_game', 'respin', 'bonus'];
export type BetResponseExt = BetResponse & { initialState: string, gameRTP: number | null };
let gameRtp: number | null = null;
export interface RTP {
  totalRTP: number;
  mainGameRTP: number;
  freeGameRTP: number;
  bonusGameRTP: number;
  ruleRTP: number;
}

export class CollectorService {
  private readonly gameEngine: GameEngineAsyncClient;

  constructor(private readonly params: Params) {
    this.gameEngine = new GameEngineAsyncClient(
      new GameEngineServiceClient(GAME_ENGINE_ADDRESS, credentials.createInsecure(), getGrpcClientOptions()),
    );
  }

  private getRequestData(request: BetResponse): string {
    const buyFeatureValue = this.params.buyFeatureEnabled && (!request || request?.state === 'idle') ? 'true' : 'false';

    if (request?.state === 'respin') {
      return `<client session="${sessionId}" rnd="${1}" show_rtp="true" command="next"></client>`;
    } else if (request?.state === 'bonus') {
      return `<client session="${sessionId}" rnd="${1}" show_rtp="true" command="bonus"><action round="0"></action></client>`;
    } else {
      return `<client session="${sessionId}" rnd="${1}" show_rtp="true" command="bet"><buy freegame="${buyFeatureValue}"/><bet cash="${this.getBet(
        request,
      )}"></bet></client>`;
    }
  }

  private getBet(request: BetResponse): number {
    if (request?.state && zeroBetStates.includes(request.state)) {
      return 0;
    }
    return this.params.bet;
  }

  async playSpin(request: BetResponse): Promise<BetResponseExt> {
    return promiseRetry(async (retry, attempts) => {
      const requestContext = request?.context ? request.context : undefined;
      const betResponse = await this.gameEngine.bet({
        requestId: '1',
        gameName: this.params.gameName,
        bet: this.getBet(request).toString(),
        requestData: this.getRequestData(request),
        context: requestContext,
        partner: { partnerId: '1', wlcode: 'default' },
        gameMode: GameMode.GAME_MODE_MAIN_GAME,
      }).catch((err) => {
        console.warn('Could not process bet', err);
        return retry(new Error(('Could not process bet')));
      });

      if (betResponse.status !== Status.STATUS_OK) {
        if (betResponse.error) {
          console.error(betResponse.error.message);
          retry(new Error(betResponse.error.message));
        }
        retry(new Error('Unspecified error in the response of the beta game engine'));
      }

      if(gameRtp == null) {
        const jsonData = parseXml(betResponse.data);
        gameRtp = +jsonData.server.rtp
      }

      const initialState = request?.state && request.state !== '' ? request.state : null;
      return {
        ...betResponse,
        initialState,
        gameRTP: gameRtp,
      }
    },
        {
          retries: GAME_ENGINE_BET_RETRY_COUNT,
          minTimeout: GAME_ENGINE_BET_RETRY_MIN_TIMEOUT,
          maxTimeout: GAME_ENGINE_BET_RETRY_MAX_TIMEOUT,
          maxRetryTime: GAME_ENGINE_BET_MAX_RETRY_TIME,
        },)
  }

  async play(threadNumber: number): Promise<RTP> {
    let betResponse: BetResponseExt;
    let total_bet = 0;
    let total_win = 0;
    let buyFeatureCount = 0;
    let freespins = 0;
    let index = 0;
    let rtp = 0;
    let fsWin = 0;
    let bonusWin = 0;
    let mainWin = 0;
    let fsRTP = 0;
    let bonusRTP = 0;
    let mainRTP = 0;
    let ruleRTP = 0;

    let numberOfSpins = this.params.microroundCount;

    console.log(`${numberOfSpins} macro rounds will be collected in the thread ${threadNumber}`);

    while (numberOfSpins) {
      ++index;
      betResponse = await this.playSpin(betResponse);
      const firstMicroRound = betResponse.microRoundData[0];

      total_bet += +firstMicroRound.bet;
      total_win += +firstMicroRound.win;

      if(betResponse.initialState === 'free_game') {
        fsWin += +firstMicroRound.win;
        fsRTP = (fsWin / total_bet) * 100;
      }
      if(betResponse.initialState === 'bonus') {
        bonusWin += +firstMicroRound.win;
        bonusRTP = (bonusWin / total_bet) * 100;
      }
      if(betResponse.initialState === 'idle' || betResponse.initialState === null) {
        mainWin += +firstMicroRound.win;
        mainRTP = (mainWin / total_bet) * 100;
      }

      rtp = (total_win / total_bet) * 100;
      ruleRTP = betResponse.gameRTP || 0;


      if (this.params.buyFeatureEnabled) {
        if (buyFeatureCount % 100 === 0 && (!betResponse || betResponse?.state === 'idle')) {
          console.log(
            `Thread: {${threadNumber}} => ${buyFeatureCount} Buy features already processed -> RTP => ${rtp}% -> ${new Date().toISOString()}`,
          );
        }
      } else {
        if (index % 1000 === 0) {
          console.log(`Thread: {${threadNumber}} => ${index} macro rounds already processed -> RTP => ${rtp}% -> ${new Date().toISOString()}`);
        }
      }

      if (betResponse?.state === 'free_game') {
        ++freespins;
      }

      if (this.params.buyFeatureEnabled) {
        if (betResponse?.state === 'idle') {
          --numberOfSpins;
          ++buyFeatureCount;
        }
      } else {
        if(betResponse.microRoundData[0].finalizeRound === true) {
          --numberOfSpins;
        }
      }
    }

    console.log(`Thread: {${threadNumber}} => Number of freespins = ${freespins}`);
    console.log(`Thread: {${threadNumber}} => Number of macro rounds = ${index}`);
    console.log(`Thread: {${threadNumber}} => RTP = ${rtp}%`);
    console.log(`Thread: {${threadNumber}} => Main RTP = ${mainRTP}%`);
    console.log(`Thread: {${threadNumber}} => FS RTP = ${fsRTP}%`);
    console.log(`Thread: {${threadNumber}} => Bonus RTP = ${bonusRTP}%`);
    console.log(`Thread: {${threadNumber}} => Rule RTP = ${ruleRTP}%`);

    return {
      totalRTP: rtp,
      mainGameRTP: mainRTP,
      freeGameRTP: fsRTP,
      bonusGameRTP: bonusRTP,
      ruleRTP: ruleRTP,
    }
  }
}
