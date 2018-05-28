class IO {
  constructor(memory) {
    this.memory = memory;
    this.bootstrapROMEnabled = true;
    this.serialBuffer = "";
  }

  read(addr) {
    if (addr == 0) {
      return 0xff;
    }
    return this.memory.read(addr);
  }

  write(addr, value) {
    if (addr == 0x1) {
      if (value == 0xa) {
        console.log("SERIAL: " + this.serialBuffer);
        this.serialBuffer = "";
      } else {
        this.serialBuffer += String.fromCharCode(value);
      }
      return;
    }
    this.memory.write(addr, value);
    if (addr == 0x50 && this.bootstrapROMEnabled) {
      this.bootstrapROMEnabled = (value != 1);
    }
  }
}
