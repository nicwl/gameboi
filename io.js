class IO {
  constructor(memory) {
    this.memory = memory;
    this.bootstrapROMEnabled = true;
  }

  read(addr) {
    return this.memory.read(addr);
  }

  write(addr, value) {
    if ([0x40, 0x42, 0x43, 0x44, 0x45, 0x4a, 0x4b, 0x26].indexOf(addr) == -1) {
      if (this.memory.read(addr) != value) {
        console.log("IO: 0x" + value.toString(16) + " written to " + addr.toString(16));
      }
    }
    this.memory.write(addr, value);
    if (addr == 0x50 && this.bootstrapROMEnabled) {
      this.bootstrapROMEnabled = (value != 1);
    }
  }
}
