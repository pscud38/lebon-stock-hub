/**
 * Barcode & QR Code Scanner Module using Html5Qrcode
 */

class BarcodeScannerManager {
  constructor() {
    this.html5QrCode = null;
    this.isScanning = false;
    this.audioCtx = null;
    this.onScanSuccessCallback = null;
  }

  // เสียง Beep แจ้งเตือนเมื่อสแกนติด (Web Audio API)
  playBeep() {
    try {
      if (!this.audioCtx) {
        this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      }
      if (this.audioCtx.state === 'suspended') {
        this.audioCtx.resume();
      }
      const osc = this.audioCtx.createOscillator();
      const gain = this.audioCtx.createGain();
      
      osc.type = 'sine';
      osc.frequency.setValueAtTime(1800, this.audioCtx.currentTime); // 1800Hz beep
      gain.gain.setValueAtTime(0.3, this.audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, this.audioCtx.currentTime + 0.15);
      
      osc.connect(gain);
      gain.connect(this.audioCtx.destination);
      
      osc.start();
      osc.stop(this.audioCtx.currentTime + 0.15);
    } catch (e) {
      console.log('Audio beep error:', e);
    }
  }

  /**
   * เริ่มเปิดกล้องสแกนเนอร์
   * @param {string} elementId - ID ของ <div> ที่จะแสดงกล้อง
   * @param {function} onScan - ฟังก์ชัน Callback เมื่ออ่านบาร์โค้ดได้
   */
  async startScanner(elementId, onScan) {
    if (this.isScanning) {
      await this.stopScanner();
    }

    this.onScanSuccessCallback = onScan;
    const scannerElement = document.getElementById(elementId);
    if (!scannerElement) return;

    try {
      this.html5QrCode = new Html5Qrcode(elementId);
      const config = {
        fps: 15,
        qrbox: { width: 250, height: 250 },
        aspectRatio: 1.0
      };

      await this.html5QrCode.start(
        { facingMode: "environment" }, // กล้องหลัง
        config,
        (decodedText, decodedResult) => {
          this.playBeep();
          if (this.onScanSuccessCallback) {
            this.onScanSuccessCallback(decodedText.trim());
          }
        },
        (errorMessage) => {
          // parse error, ignore continuously
        }
      );

      this.isScanning = true;
    } catch (err) {
      console.error("Failed to start scanner:", err);
      alert("ไม่สามารถเปิดกล้องได้: กรุณาอนุญาตการเข้าถึงกล้อง (Camera Permission) ในบราวเซอร์ หรือใช้อุปกรณ์ที่มีกล้อง");
      this.isScanning = false;
    }
  }

  /**
   * ปิดกล้องสแกนเนอร์
   */
  async stopScanner() {
    if (this.html5QrCode && this.isScanning) {
      try {
        await this.html5QrCode.stop();
        this.html5QrCode.clear();
      } catch (err) {
        console.warn("Error stopping scanner:", err);
      }
      this.isScanning = false;
      this.html5QrCode = null;
    }
  }
}

const scannerManager = new BarcodeScannerManager();
