import { suiSyncService } from "./sync-service";

export class SuiScheduler {
  private intervalId: NodeJS.Timeout | null = null;
  private isRunning = false;

  /**
   * 정기 동기화 시작 (기본: 5분마다)
   */
  start(intervalMinutes: number = 5): void {
    if (this.isRunning) {
      console.log("🔄 Sui 스케줄러가 이미 실행 중입니다");
      return;
    }

    const intervalMs = intervalMinutes * 60 * 1000;

    console.log(`🕐 Sui 정기 동기화 시작 (${intervalMinutes}분마다)`);

    this.intervalId = setInterval(async () => {
      try {
        await suiSyncService.performScheduledSync();
      } catch (error: any) {
        console.error("❌ 정기 동기화 중 오류 발생:", error.message);
      }
    }, intervalMs);

    this.isRunning = true;

    // 즉시 한 번 실행
    setTimeout(async () => {
      try {
        await suiSyncService.performScheduledSync();
      } catch (error: any) {
        console.error("❌ 초기 동기화 중 오류 발생:", error.message);
      }
    }, 5000); // 5초 후 첫 실행
  }

  /**
   * 정기 동기화 중지
   */
  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      this.isRunning = false;
      console.log("🛑 Sui 정기 동기화 중지됨");
    }
  }

  /**
   * 현재 실행 상태 확인
   */
  isActive(): boolean {
    return this.isRunning;
  }

  /**
   * 수동으로 동기화 실행
   */
  async runNow(): Promise<void> {
    console.log("🔄 수동 동기화 시작");
    try {
      await suiSyncService.performScheduledSync();
      console.log("✅ 수동 동기화 완료");
    } catch (error: any) {
      console.error("❌ 수동 동기화 실패:", error.message);
      throw error;
    }
  }
}

export const suiScheduler = new SuiScheduler();
