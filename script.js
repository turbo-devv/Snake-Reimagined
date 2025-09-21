/* Snake — Reimagined
   - Black & white
   - Smooth interpolation
   - Pixel-style text via small offscreen canvas scaling
   - Particles on food eaten
*/

(() => {
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');

  // Grid settings
  const CELL = 14;          // logical pixel per grid cell (render size)
  const GRID_W = 40;       // grid columns
  const GRID_H = 28;       // grid rows

  // Offscreen canvas for pixel text rendering (draw small, then scale up)
  const smallTextCanvas = document.createElement('canvas');
  const smallCtx = smallTextCanvas.getContext('2d');

  // Desired rendered canvas size
  canvas.width = GRID_W * CELL;
  canvas.height = GRID_H * CELL;

  // Make canvas crisp when CSS scales
  canvas.style.width = `${canvas.width}px`;
  canvas.style.height = `${canvas.height}px`;
  canvas.imageSmoothingEnabled = false;

  // Game state
  let running = false;
  let playing = false;
  let gameOver = false;
  let score = 0;

  // Movement / timing
  const STEPS_PER_SECOND = 7.5; // feel free to tweak (smoothness maintained)
  let stepInterval = 1 / STEPS_PER_SECOND;
  let stepProgress = 0; // 0..1 progress between steps

  // Direction vectors
  const DIRS = {
    left:  {x:-1,y:0},
    right: {x:1,y:0},
    up:    {x:0,y:-1},
    down:  {x:0,y:1},
  };

  // snake represented as array of {x,y} grid positions (integers)
  let snake = [];
  let prevSnake = [];
  let dir = DIRS.right;
  let nextDir = dir;
  let grow = 0;

  // Food
  let food = null;

  // Particles
  const particles = [];

  function startNewGame() {
    score = 0;
    gameOver = false;
    playing = true;
    // start snake in center length 4
    const cx = Math.floor(GRID_W / 2);
    const cy = Math.floor(GRID_H / 2);
    snake = [
      {x: cx-3, y: cy},
      {x: cx-2, y: cy},
      {x: cx-1, y: cy},
      {x: cx,   y: cy}
    ];
    prevSnake = snake.map(p => ({x:p.x,y:p.y}));
    dir = DIRS.right;
    nextDir = dir;
    grow = 0;
    stepProgress = 0;
    placeFood();
  }

  function placeFood() {
    // place on random free cell
    let tries = 0;
    while (tries < 1000) {
      const fx = Math.floor(Math.random()*GRID_W);
      const fy = Math.floor(Math.random()*GRID_H);
      const collision = snake.some(s => s.x === fx && s.y === fy);
      if (!collision) {
        food = {x: fx, y: fy};
        return;
      }
      tries++;
    }
    // fallback
    food = {x: 1, y:1};
  }

  function stepSnake() {
    // Save prev positions for interpolation
    prevSnake = snake.map(s => ({x:s.x,y:s.y}));

    // new head candidate
    const head = snake[snake.length-1];
    const newHead = {x: head.x + dir.x, y: head.y + dir.y};

    // check wall collision -> end game
    if (newHead.x < 0 || newHead.x >= GRID_W || newHead.y < 0 || newHead.y >= GRID_H) {
      triggerGameOver();
      return;
    }

    // check self collision
    if (snake.some(s => s.x === newHead.x && s.y === newHead.y)) {
      triggerGameOver();
      return;
    }

    snake.push(newHead);
    if (grow > 0) {
      grow--;
    } else {
      snake.shift();
    }

    // check eat
    if (food && newHead.x === food.x && newHead.y === food.y) {
      score += 10;
      grow += 2; // grow 2 cells on eat
      spawnEatParticles(food.x, food.y, 18);
      placeFood();
    }
  }

  function triggerGameOver() {
    gameOver = true;
    playing = false;
    spawnDeathParticles(snake[snake.length-1].x, snake[snake.length-1].y, 36);
  }

  function spawnEatParticles(gridX, gridY, n) {
    const cx = (gridX + 0.5) * CELL;
    const cy = (gridY + 0.5) * CELL;
    for (let i=0;i<n;i++){
      const angle = Math.random()*Math.PI*2;
      const speed = 30 + Math.random()*120;
      particles.push({
        x: cx,
        y: cy,
        vx: Math.cos(angle)*speed,
        vy: Math.sin(angle)*speed,
        life: 0.6 + Math.random()*0.4,
        size: 1 + Math.floor(Math.random()*3)
      });
    }
  }
  function spawnDeathParticles(gridX, gridY, n) {
    spawnEatParticles(gridX, gridY, n);
  }

  // Input
  const keyDirMap = {
    ArrowLeft: DIRS.left, KeyA: DIRS.left,
    ArrowRight: DIRS.right, KeyD: DIRS.right,
    ArrowUp: DIRS.up, KeyW: DIRS.up,
    ArrowDown: DIRS.down, KeyS: DIRS.down,
  };

  window.addEventListener('keydown', e => {
    if (e.code === 'Space') {
      if (!playing) startNewGame();
    }
    const d = keyDirMap[e.code];
    if (d) {
      queueDirection(d);
    }
  });

  function queueDirection(d) {
    // avoid reversing directly
    if ((d.x + dir.x === 0 && d.y + dir.y === 0) || (d.x + nextDir.x === 0 && d.y + nextDir.y === 0)) {
      return;
    }
    nextDir = d;
  }

  // Smooth interpolation rendering:
  // We keep prevSnake and snake (last committed positions). stepProgress goes 0->1 between steps.
  // Render positions = lerp(prev[i], cur[i], stepProgress).
  function render() {
    const W = canvas.width, H = canvas.height;
    // Clear
    ctx.fillStyle = '#000';
    ctx.fillRect(0,0,W,H);

    // Draw grid cells in white when needed (optional faint grid - turned off to keep 80s look)
    // draw food
    if (food) {
      drawCell(food.x, food.y, true);
    }

    // Draw snake (interpolated)
    const cur = snake;
    const prev = prevSnake;
    const t = stepProgress;

    // For rendering segments, we want to interpolate corresponding indices.
    // When snake grew, prev length could be smaller — handle gracefully.
    const maxLen = Math.max(prev.length, cur.length);
    for (let i=0;i<cur.length;i++){
      const curPos = cur[i];
      const prevPos = prev[i] || curPos;
      const ix = lerp(prevPos.x, curPos.x, t);
      const iy = lerp(prevPos.y, curPos.y, t);
      const px = Math.round(ix * CELL);
      const py = Math.round(iy * CELL);
      // Slightly rounded rectangle for smoothness
      ctx.fillStyle = '#fff';
      // draw filled rect (we keep fully filled pixels to stay retro)
      ctx.fillRect(px, py, CELL, CELL);
    }

    // Draw score (pixelated text)
    drawPixelText(`SCORE ${score}`, 8, 8, 2);

    if (!playing) {
      if (!gameOver) {
        drawCenteredPixelText("PRESS SPACE TO START", canvas.width/2, canvas.height/2 - 8, 3, true);
        drawCenteredPixelText("ARROWS / WASD to move", canvas.width/2, canvas.height/2 + 22, 2, true);
      } else {
        drawCenteredPixelText("GAME OVER", canvas.width/2, canvas.height/2 - 6, 4, true);
        drawCenteredPixelText("PRESS SPACE TO RESTART", canvas.width/2, canvas.height/2 + 26, 2, true);
        drawCenteredPixelText(`SCORE ${score}`, canvas.width/2, canvas.height/2 + 52, 2, true);
      }
    }

    // Draw particles
    ctx.fillStyle = '#fff';
    particles.forEach(p => {
      ctx.fillRect(Math.round(p.x), Math.round(p.y), p.size, p.size);
    });
  }

  function drawCell(gx, gy, filled) {
    ctx.fillStyle = filled ? '#fff' : '#000';
    ctx.fillRect(gx*CELL, gy*CELL, CELL, CELL);
  }

  // helper: linear interpolation
  function lerp(a,b,t){return a + (b-a)*t;}

  // Pixel text drawing: draw small text to offscreen canvas and scale up (keeps blocky)
  function drawPixelText(text, x, y, scale=2){
    // small canvas size: compute text width in small pixels
    const smallFontSize = 8; // small pixels per character height
    smallCtx.font = `${smallFontSize}px monospace`;
    const padding = 2;
    const metrics = smallCtx.measureText(text);
    const w = Math.ceil(metrics.width) + padding*2;
    const h = smallFontSize + padding*2;
    smallTextCanvas.width = w;
    smallTextCanvas.height = h;
    // small context draw
    smallCtx.fillStyle = '#000';
    smallCtx.fillRect(0,0,w,h);
    smallCtx.fillStyle = '#fff';
    smallCtx.font = `${smallFontSize}px monospace`;
    smallCtx.textBaseline = 'top';
    smallCtx.fillText(text, padding, padding - 1); // tiny tweak
    // scale up to main canvas
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(smallTextCanvas, x, y, w*scale, h*scale);
  }

  function drawCenteredPixelText(text, cx, cy, scale=3, centerHoriz=true){
    // measure small width for centering
    const smallFontSize = 8;
    smallCtx.font = `${smallFontSize}px monospace`;
    const padding = 2;
    const metrics = smallCtx.measureText(text);
    const w = Math.ceil(metrics.width) + padding*2;
    const h = smallFontSize + padding*2;
    const x = centerHoriz ? cx - (w*scale)/2 : cx;
    const y = cy - (h*scale)/2;
    // draw same as drawPixelText with positioning
    smallTextCanvas.width = w;
    smallTextCanvas.height = h;
    smallCtx.fillStyle = '#000';
    smallCtx.fillRect(0,0,w,h);
    smallCtx.fillStyle = '#fff';
    smallCtx.font = `${smallFontSize}px monospace`;
    smallCtx.textBaseline = 'top';
    smallCtx.fillText(text, padding, padding - 1);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(smallTextCanvas, x, y, w*scale, h*scale);
  }

  // main loop
  let last = performance.now();
  function loop(now) {
    const dt = Math.min(0.1, (now - last)/1000);
    last = now;

    if (playing) {
      // update direction from queued nextDir (this prevents double-reverses)
      if (!gameOver) dir = nextDir;
      stepProgress += dt * STEPS_PER_SECOND;
      if (stepProgress >= 1) {
        // advance one or more steps (if dt large)
        const stepsToDo = Math.floor(stepProgress);
        stepProgress = stepProgress - stepsToDo;
        for (let i=0;i<stepsToDo;i++){
          if (!playing) break;
          stepSnake();
        }
      }
    }

    // update particles
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.life -= dt;
      if (p.life <= 0) {
        particles.splice(i,1);
        continue;
      }
      // physics-ish
      p.vy += 200 * dt * 0.6; // gravity subtle
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      // small drag
      p.vx *= 0.98;
      p.vy *= 0.98;
    }

    render();
    requestAnimationFrame(loop);
  }

  // Resize handling: keep canvas crisp but scaled via CSS for responsive layout
  function handleResize(){
    // We keep the internal canvas size fixed to GRID_W * CELL to ensure pixel grid consistency.
    // CSS scaling will be handled via max-width/max-height in CSS.
    canvas.style.width = `${Math.min(window.innerWidth - 40, canvas.width)}px`;
    canvas.style.height = `${Math.min(window.innerHeight - 120, canvas.height)}px`;
  }
  window.addEventListener('resize', handleResize);

  // Start loop
  handleResize();
  requestAnimationFrame(loop);

  // initial not playing, show start screen
  running = true;
  playing = false;
  gameOver = false;
  drawCenteredPixelText("PRESS SPACE TO START", canvas.width/2, canvas.height/2 - 8, 3, true);

  // expose small helpers for debugging in console
  window.SnakeGame = {
    start: startNewGame,
    stop: () => { playing = false; gameOver = true; },
    getScore: () => score,
  };

})();
