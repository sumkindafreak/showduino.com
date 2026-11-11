// Host harness: run the P4 firmware SHDO compiler (new_showduino protocol/showduino_shdo.h)
// on one .shdo file and print its status and compiled cues. See regenerate.cjs.
#include <cstdio>
#include <cstring>
#include <string>
#include <fstream>
#include <sstream>
#include "showduino_shdo.h"
int main(int argc, char **argv) {
  if (argc < 2) return 2;
  std::ifstream f(argv[1], std::ios::binary); std::stringstream ss; ss << f.rdbuf(); std::string doc = ss.str();
  static ShdoCue cues[SHOWDUINO_SHDO_MAX_CUES]; ShdoManifest manifest{}; uint16_t count = 0; char err[128] = "";
  ShdoStatus st = shdoCompile(doc.c_str(), doc.size(), &manifest, cues, SHOWDUINO_SHDO_MAX_CUES, &count, err, sizeof(err));
  std::printf("STATUS\t%s\t%s\n", shdoStatusName(st), err);
  if (st == SHDO_OK) { std::printf("ID\t%s\n", manifest.productionId); for (uint16_t i = 0; i < count; ++i) std::printf("CUE\t%u\t%s\t%s\n", (unsigned)cues[i].timeMs, cues[i].type, cues[i].command); }
  return 0;
}
