#pragma once

#include "cpu.h"

static uint8_t rlc(uint8_t v) {
  v = (v << 1) | (v >> 7);
  cpu.reg.name.f = 0;
  MOD_FLAG(FLAG_C, v & 1);
  MOD_FLAG(FLAG_Z, !v);
  return v;
}

static uint8_t rrc(uint8_t v) {
  v = (v >> 1) | (v << 7);
  cpu.reg.name.f = 0;
  MOD_FLAG(FLAG_C, v & (1 << 7));
  MOD_FLAG(FLAG_Z, !v);
  return v;
}

static uint8_t rl(uint8_t v) {
  uint8_t c = GET_FLAG(FLAG_C);
  MOD_FLAG(FLAG_C, v >> 7);
  v = (v << 1) | c;
  MOD_FLAG(FLAG_Z, !v);
  return v;
}
