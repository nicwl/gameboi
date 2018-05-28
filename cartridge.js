const NO_MBC = 0x0;
const MBC1 = 0x1;
const MBC2 = 0x5;
const MBC3 = 0x13;

class Cartridge {
  constructor(rom) {
    this.rom = rom;
    this.mbcType = this.rom.read(0x147);
    this.selectedRomBank = 1;
    this.selectedRamBank = 0;
    this.ramEnabled = false;
    this.ram = null;
    if (this.mbcType == MBC3) {
      this.ram = (new Array(0x2000 * 4)).fill(0);
    }
  }

  read(addr) {
    if (addr < 0x4000 || (this.mbcType == NO_MBC && addr < 0x8000)) {
      return this.rom.read(addr);
    } else if (this.selectedRomBank !== null && addr < 0x8000) {
      return this.rom.read((this.selectedRomBank - 1) * 0x4000 + addr);
    } else if (0xa000 <= addr && addr < 0xc000 && this.ramEnabled) {
      return this.ram[(addr - 0xa000) + this.selectedRamBank*0x2000];
    } else {
      console.log("Read from uninitialized switchable ROM at " + addr.toString(16));
    }
  }

  write(addr, value) {
    if (this.mbcType == NO_MBC) {
      return;
    }
    if (this.ramEnabled && 0xa000 < addr && addr < 0xc000) {
      this.ram[(addr - 0xa000) + this.selectedRamBank*0x2000] = value & 0xff;
      return;
    }
    if (0 <= addr && addr < 0x2000) {
      this.ramEnabled = ((value & 0x0f) == 0xa);
    } else if (0x2000 <= addr && addr < 0x4000) {
      let selected = value;
      if (this.mbcType === MBC1) {
        selected &= 0x1f;
      } else if (this.mbcType == MBC2) {
        selected &= 0x7f;
      }
      if (selected == 0) {
        selected = 1;
      }
      this.selectedRomBank = selected;
      console.log("Selected ROM bank " + selected);
    } else if (0x4000 <= addr && addr < 0x6000) {
      if (value < 4) {
        this.selectedRamBank = value;
      }
    } else {
      console.log("Unknown bank write 0x" + value.toString(16) + " at 0x" + addr.toString(16));
    }
  }
}
