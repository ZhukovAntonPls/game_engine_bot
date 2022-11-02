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

const sessionId = '1';
const zeroBetStates = ['free_game', 'respin', 'bonus'];

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
      return `<client session="${sessionId}" rnd="${1}" command="next"></client>`;
    } else if (request?.state === 'bonus') {
      return `<client session="${sessionId}" rnd="${1}" command="bonus"><action round="0"></action></client>`;
    } else {
      return `<client session="${sessionId}" rnd="${1}" command="bet"><buy freegame="${buyFeatureValue}"/><bet cash="${this.getBet(
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

  async playSpin(request: BetResponse): Promise<BetResponse> {
    return promiseRetry(async (retry, attempts) => {
      const betResponse = await this.gameEngine.bet({
        requestId: '1',
        gameName: this.params.gameName,
        bet: this.getBet(request).toString(),
        requestData: this.getRequestData(request),
        context: request?.context ? request.context : undefined,
        partner: { partnerId: '1', wlcode: 'default' },
        gameMode: GameMode.GAME_MODE_MAIN_GAME,
      }).catch((err) => {
        console.warn('Could not process bet', err);
        return retry(new Error(('Could not process bet')));
      });;

      if (betResponse.status !== Status.STATUS_OK) {
        if (betResponse.error) {
          console.error(betResponse.error.message);
          retry(new Error(betResponse.error.message));
        }
        retry(new Error('Unspecified error in the response of the beta game engine'));
      }
      return betResponse;
    },
        {
          retries: GAME_ENGINE_BET_RETRY_COUNT,
          minTimeout: GAME_ENGINE_BET_RETRY_MIN_TIMEOUT,
          maxTimeout: GAME_ENGINE_BET_RETRY_MAX_TIMEOUT,
          maxRetryTime: GAME_ENGINE_BET_MAX_RETRY_TIME,
        },)
  }

  async play(threadNumber: number): Promise<number> {
    let betResponse: BetResponse;
    let total_bet = 0;
    let total_win = 0;
    let buyFeatureCount = 0;
    let freespins = 0;
    let index = 0;
    let rtp = 0;

    let numberOfSpins = this.params.microroundCount;

    console.log(`${numberOfSpins} microrounds will be collected in the thread ${threadNumber}`);

    while (numberOfSpins) {
      ++index;
      betResponse = await this.playSpin(betResponse);

      total_bet += +betResponse.bet;
      total_win += +betResponse.win;

      rtp = (total_win / total_bet) * 100;

      if (this.params.buyFeatureEnabled) {
        if (buyFeatureCount % 100 === 0 && (!betResponse || betResponse?.state === 'idle')) {
          console.log(
            `Thread: {${threadNumber}} => ${buyFeatureCount} Buy features already processed -> RTP => ${rtp}% -> ${new Date().toISOString()}`,
          );
        }
      } else {
        if (index % 1000 === 0) {
          console.log(`Thread: {${threadNumber}} => ${index} microrounds already processed -> RTP => ${rtp}% -> ${new Date().toISOString()}`);
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
        --numberOfSpins;
      }
    }

    console.log(`Thread: {${threadNumber}} => Number of freespins = ${freespins}`);
    console.log(`Thread: {${threadNumber}} => Number of microrounds = ${index}`);
    console.log(`Thread: {${threadNumber}} => RTP = ${rtp}%`);

    return rtp;
  }
}
