class Timer {
  constructor(io) {
    this.io = io;
    this.tick = 0;
    this.firstTime = null;
    this.nRuns = 0;
  }

  // Called at a rate of 16384 Hz
  execute() {
    this.div = this.io.read(0x04);
    this.tima = this.io.read(0x05);
    this.tma = this.io.read(0x06);
    this.tac = this.io.read(0x07);

    this.executeImpl();

    this.io.write(0x04, this.div);
    this.io.write(0x05, this.tima);
    this.io.write(0x06, this.tma);
    this.io.write(0x06, this.tac);
  }

  hertz() {
    return this.nRuns / (performance.now() - this.firstTime) * 1000;
  }

  executeImpl() {
    if (this.firstTime === null) {
      this.firstTime = performance.now();
      this.nRuns = 0;
    } else {
      this.nRuns++;
    }
    this.tick = (this.tick + 1) & 0xffff;
    if ((this.tick & 0xf) === 0) {
      this.div = (this.div + 1) & 0xff;
    }
    if ((this.tac & 0x4) === 0) {
      // timer disabled
      return;
    }
    let frequency = (this.tac & 0x3);
    switch (frequency) {
      case 0:
        if ((this.tick & 0x3f) === 0) {
          this.tima += 1;
        }
        break;
      case 1:
        this.tima += 1;
        break;
      case 2:
        if ((this.tick & 0x3) === 0) {
          this.tima += 1;
        }
        break;
      case 3:
        if ((this.tick & 0xf) === 0) {
          this.tima += 1;
        }
        break;
    }
    if (this.tima === 0x100) {
      this.io.write(0x0f, this.io.read(0x0f) | INT_TIMER);
      this.tima = this.tma;
    }
    this.tima &= 0xff;
  }
}
