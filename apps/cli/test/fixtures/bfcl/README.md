# BFCL test fixtures

`BFCL_v4_multiple.json` and `BFCL_v4_multiple_possible_answer.json` are unmodified copies of
`berkeley-function-call-leaderboard/bfcl_eval/data/BFCL_v4_multiple.json` and
`.../data/possible_answer/BFCL_v4_multiple.json` from
[ShishirPatil/gorilla](https://github.com/ShishirPatil/gorilla) at commit
`f7cf7359b7ac615a0b294831c5ba2bc95ee4a000`, by the Gorilla team at UC Berkeley, released under
the Apache License 2.0 (`LICENSE`, copied from the same commit). The tests use them so that
they never touch the network; the runner fetches the same files from GitHub and checks the same
hashes.

`conformance.json` is written by `python3 scripts/benchmarks/bfcl_crosscheck.py corpus`: answers
built from those files, with the verdict of BFCL's own checker on each.
