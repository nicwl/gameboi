const REG_NR52 = 0xFF26;
const REG_NR11 = 0xFF11;
const REG_NR12 = 0xFF12;
const REG_NR13 = 0xFF13;
const REG_NR14 = 0xFF14;

if(!('AudioContext' in window) && 'webkitAudioContext' in window) {
    const AudioContext = webkitAudioContext;
}

class Speaker {
  constructor(memory) {
    this.memory = memory;
    this.audioCtx = new AudioContext();
    this.channel1 = this.audioCtx.createOscillator();
    this.channel1GainNode = this.audioCtx.createGain();
    this.channel1GainNode.connect(this.audioCtx.destination);
    this.channel1GainNode.gain.setValueAtTime(0, this.audioCtx.currentTime);
    this.channel1.connect(this.channel1GainNode);
    this.channel1.type = "square";
    this.channel1.start();
    this.channel1StartTime = null;
    this.channel1On = false;
    this.channel1VEStep = null;
    this.channel1Volume = null;
  }

  execute() {
    this.nr52 = this.memory.read(REG_NR52);
    this.nr11 = this.memory.read(REG_NR11);
    this.nr12 = this.memory.read(REG_NR12);
    this.nr13 = this.memory.read(REG_NR13);
    this.nr14 = this.memory.read(REG_NR14);

    this.executeImpl();

    this.memory.write(REG_NR52, this.nr52);
    this.memory.write(REG_NR11, this.nr11);
    this.memory.write(REG_NR12, this.nr12);
    this.memory.write(REG_NR13, this.nr13);
    this.memory.write(REG_NR14, this.nr14);
  }

  executeImpl() {
    if (!this.isSoundOn()) return;
    let currentTime = performance.now();
    this.channel1.frequency.setValueAtTime(this.channel1Frequency(), this.audioCtx.currentTime);

    if (this.channel1FrequencyInitial() == 1) {
      this.channel1On = true;
      this.channel1StartTime = currentTime;
      this.channel1VEStep = 0;
      this.channel1Volume = this.channel1InitialVolume();
      this.channel1GainNode.gain.setValueAtTime((this.channel1Volume / 15), this.audioCtx.currentTime);
      this.resetChannel1FrequencyInitial();
    }

    if (this.channel1On) {
      if (this.channel1VolumeSweepNumber() != 0) {
        let nextStepTime = this.channel1StartTime + this.channel1VEStep*this.channel1VolumeSweepNumber()*(1000/64);
        if (currentTime > nextStepTime) {
          let nextVolume = this.channel1Volume + this.channel1VolumeDirection();
          if (nextVolume >= 0 && nextVolume <= 15) {
            this.channel1VEStep += 1;
            this.channel1Volume = nextVolume;
            this.channel1GainNode.gain.setValueAtTime((this.channel1Volume / 15), this.audioCtx.currentTime);
          }
        }
      }
      if (this.channel1IsFinite() && this.channel1SoundLength() <= (this.channel1StartTime - currentTime)) {
        this.channel1GainNode.gain.setValueAtTime((this.channel1Volume / 15), this.audioCtx.currentTime);
      }
    }
  }

  isSoundOn() {
    return (this.nr52 & (1 << 7)) > 0;
  }

  channel1SoundWaveDuty() {
    return (this.nr11 & 0xc0) >> 6;
  }

  channel1SoundLength() {
    return (64 - (this.nr11 & 0x3f)) * (1000/256);
  }

  channel1InitialVolume() {
    return (this.nr12 & 0xf0) >> 4;
  }

  channel1VolumeDirection() {
    return -1 + 2*((this.nr12 & 0x8) >> 3);
  }

  channel1VolumeSweepNumber() {
    return (this.nr12 & 0x7);
  }

  channel1Frequency() {
    return 131072 / (2048 - (this.nr13 | ((this.nr14 & 0x7) << 8)));
  }

  channel1FrequencyInitial() {
    return (this.nr14 & 0x80) >> 7;
  }

  channel1IsFinite() {
    return (this.nr14 & 0x40) > 0;
  }

  resetChannel1FrequencyInitial() {
    this.nr14 &= ~0x80;
  }
}
