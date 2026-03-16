param count 80 range:10..200 step:10
color bg #1a1a2e
color fg #e94560

frame:
  bg $bg
  loop count:
    circle rand(w) rand(h) r:4 fill:$fg
