class BadMemory {
  constructor(name) {
    this.name = name;
  }

  read(address) {
    console.error("Bad read from address 0x" + address.toString(16) + " of " + this.name);
    return 0xff;
  }

  write(address, value) {
    console.error("Bad write 0x" + value.toString(16) + " to address 0x" + address.toString(16) + " of " + this.name);
  }
}

class Memory {
  constructor(memories) {
    this.romBank = memories.romBank || new BadMemory('romBank');
    this.switchableROMBank = memories.switchableROMBank || new BadMemory('switchableROMBank');
    this.videoRAM = memories.videoRAM || new BadMemory('videoRAM');
    this.switchableRAM = memories.switchableRAM || new BadMemory('switchableRAM');
    this.internalRAM = memories.internalRAM || new BadMemory('internalRAM');
    this.oam = memories.oam || new BadMemory('oam');
    this.io = memories.io || new BadMemory('io');
    this.stack = memories.stack || new BadMemory('stack');
    this.enableInterruptRegister = memories.enableInterruptRegister || new BadMemory('enableInterruptRegister');
    this.bootstrapROM = memories.bootstrapROM || new BadMemory('bootstrapROM');

    this.map = [
      [0x0000, this.romBank],
      [0x4000, this.switchableROMBank],
      [0x8000, this.videoRAM],
      [0xa000, this.switchableRAM],
      [0xc000, this.internalRAM],
      [0xe000, this.internalRAM],
      [0xfe00, this.oam],
      [0xff00, this.io],
      [0xff80, this.stack],
      [0xffff, this.enableInterruptRegister],
    ];
  }

  mapAddress(address) {
    if (this.bootstrapROM !== null && address <= 0xff) {
      return {'region': this.bootstrapROM, 'offset': address}
    }
    let last = null;
    let regionStart = null;
    for (let [startAddr, region] of this.map) {
      if (startAddr <= address) {
        last = region;
        regionStart = startAddr;
      }
    }
    return {'region': last, 'offset': address - regionStart}
  }

  read(address) {
    let {region, offset} = this.mapAddress(address);
    return region.read(offset) & 0xff;
  }

  write(address, value) {
    let {region, offset} = this.mapAddress(address);
    region.write(offset, value & 0xff);
  }
}
