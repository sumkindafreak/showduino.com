// W005 firmware contract harness. Compiles new_showduino's own SHDO v2 compiler
// (protocol/showduino_shdo.h) on a Linux host and runs it on .shdo files exported by the
// website Studio. It prints the status, the compiled cue count and every compiled command.
// No hardware is involved; this proves file compatibility, not physical behaviour.
//   g++ -std=c++17 -I<new_showduino>/protocol tools/shdo-contract/shdo_check.cpp -o shdo_check
#include <cstdio>
#include <fstream>
#include <string>
#include <vector>
#include "showduino_shdo.h"
#include "showduino_deploy.h"

int main(int argc, char **argv) {
  int bad = 0;
  for (int i = 1; i < argc; ++i) {
    std::ifstream in(argv[i], std::ios::binary);
    std::string s((std::istreambuf_iterator<char>(in)), std::istreambuf_iterator<char>());
    ShdoManifest m{};
    std::vector<ShdoCue> cues(SHOWDUINO_SHDO_MAX_CUES);
    uint16_t n = 0;
    char err[160] = {};
    const ShdoStatus st = shdoCompile(s.c_str(), s.size(), &m, cues.data(), (uint16_t)cues.size(), &n, err, sizeof err);
    const bool sizeOk = s.size() <= SHOWDUINO_SHDO_MAX_BYTES;
    std::printf("%s bytes=%zu deployLimit=%u sizeOk=%s status=%s cues=%u err=\"%s\"\n", argv[i], s.size(),
                (unsigned)SHOWDUINO_SHDO_MAX_BYTES, sizeOk ? "yes" : "NO", shdoStatusName(st), n, err);
    for (uint16_t k = 0; k < n; ++k) std::printf("  %8u %-6s %s\n", cues[k].timeMs, cues[k].type, cues[k].command);
    if (st != SHDO_OK || !sizeOk) ++bad;
  }
  return bad ? 1 : 0;
}
