
    const $ = (id) => document.getElementById(id);
    const state = {
      running: true,
      theme: 'dark',
      samples: 420,
      pressureHistory: [],
      flowHistory: [],
      volumeHistory: []
    };

    const inputs = ['rr','vt','peep','fio2','itime','compliance','resistance','mode'];
    const outputs = {
      rr: $('rrOut'), vt: $('vtOut'), peep: $('peepOut'), fio2: $('fio2Out'), itime: $('itimeOut'), compliance: $('complianceOut'), resistance: $('resistanceOut')
    };

    function getValues(){
      return {
        mode: $('mode').value,
        rr: +$('rr').value,
        vt: +$('vt').value,
        peep: +$('peep').value,
        fio2: +$('fio2').value,
        itime: +$('itime').value,
        compliance: +$('compliance').value,
        resistance: +$('resistance').value
      };
    }

    function syncLabels(){
      const v = getValues();
      outputs.rr.textContent = v.rr;
      outputs.vt.textContent = `${v.vt} mL`;
      outputs.peep.textContent = v.peep;
      outputs.fio2.textContent = `${v.fio2}%`;
      outputs.itime.textContent = `${v.itime.toFixed(1)} s`;
      outputs.compliance.textContent = v.compliance;
      outputs.resistance.textContent = v.resistance;
      computeMetrics();
    }

    function computeMetrics(){
      const v = getValues();
      const elasticPressure = v.vt / v.compliance;
      const resistivePressure = (v.resistance * (v.vt / 1000) / Math.max(v.itime, 0.5));
      let pip = v.peep + elasticPressure + resistivePressure;
      let plateau = v.peep + elasticPressure;
      if (v.mode === 'pcv') {
        pip = v.peep + 14 + (60 - v.compliance) * 0.08;
        plateau = pip - 2;
      }
      if (v.mode === 'psv') {
        pip = v.peep + 10 + (v.resistance * 0.15);
        plateau = pip - 3;
      }
      const mv = (v.rr * v.vt) / 1000;
      const dp = plateau - v.peep;
      $('pipMetric').textContent = pip.toFixed(1);
      $('platMetric').textContent = plateau.toFixed(1);
      $('mvMetric').textContent = mv.toFixed(1);
      $('dpMetric').textContent = dp.toFixed(1);

      let title = 'Estado do sistema: Estável';
      let text = 'Os parâmetros estão em uma faixa educacional simulada para demonstração do protótipo, com ritmo respiratório ajustado para um ciclo mais próximo do cenário adulto real.';
      if (pip > 35) {
        title = 'Alerta: pressão inspiratória elevada';
        text = 'A pressão de pico estimada ultrapassou a faixa configurada para demonstração. Revise VT, resistência ou tempo inspiratório.';
      } else if (v.fio2 > 80) {
        title = 'Alerta: FiO₂ alta';
        text = 'A fração inspirada de oxigênio está elevada na simulação. Em um produto real isso exigiria avaliação clínica contínua.';
      } else if (dp > 15) {
        title = 'Atenção: driving pressure aumentada';
        text = 'A driving pressure simulada subiu. O protótipo destaca a relação entre VT, PEEP e complacência.';
      }
      $('alarmTitle').textContent = title;
      $('alarmText').textContent = text;
    }

    function phaseInfo(t, cycle, itime){
      const local = t % cycle;
      const insp = local <= itime;
      $('phaseLabel').textContent = `Fase: ${insp ? 'Inspiração' : 'Expiração'}`;
      return { insp, local };
    }

    function nextSample(t){
      const v = getValues();
      const cycle = 60 / v.rr;
      const exptime = Math.max(cycle - v.itime, v.itime * 1.6, 0.8);
      const { insp, local } = phaseInfo(t, cycle, v.itime);
      const normInsp = Math.min(local / v.itime, 1);
      const normExp = Math.min((local - v.itime) / exptime, 1);
      const pip = parseFloat($('pipMetric').textContent);
      const plateau = parseFloat($('platMetric').textContent);

      let pressure, flow, volume;
      if (insp) {
        pressure = v.peep + (pip - v.peep) * Math.sin(normInsp * Math.PI * 0.72);
        flow = (v.vt / Math.max(v.itime, 0.5)) / 22 * (0.92 + 0.08 * Math.sin(normInsp * Math.PI * 0.8));
        volume = v.vt * Math.sin(normInsp * Math.PI * 0.5);
      } else {
        pressure = plateau - (plateau - v.peep) * Math.pow(normExp, 0.82);
        flow = -((v.vt / Math.max(exptime, 0.8)) / 26) * Math.exp(-normExp * 2.4);
        volume = v.vt * Math.max(1 - normExp, 0);
      }

      if (v.mode === 'pcv') volume *= 0.92 + (v.compliance / 100);
      if (v.mode === 'psv') flow *= 0.82;

      return { pressure, flow, volume };
    }

    function push(arr, value){
      arr.push(value);
      if (arr.length > state.samples) arr.shift();
    }

    function drawWave(canvasId, values, color, min, max, unit){
      const canvas = $(canvasId);
      const ctx = canvas.getContext('2d');
      const w = canvas.width, h = canvas.height;
      ctx.clearRect(0,0,w,h);
      ctx.fillStyle = '#0f1114';
      ctx.fillRect(0,0,w,h);

      ctx.strokeStyle = 'rgba(255,255,255,0.08)';
      ctx.lineWidth = 1;
      for(let i=0;i<6;i++){
        const y = (h/5)*i;
        ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(w,y); ctx.stroke();
      }

      ctx.strokeStyle = color;
      ctx.lineWidth = 3;
      ctx.beginPath();
      values.forEach((val, i) => {
        const x = (i / Math.max(values.length - 1, 1)) * w;
        const y = h - ((val - min) / (max - min)) * h;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      });
      ctx.stroke();

      ctx.fillStyle = 'rgba(255,255,255,0.75)';
      ctx.font = '12px Satoshi, sans-serif';
      ctx.fillText(`${max.toFixed(0)} ${unit}`, 10, 16);
      ctx.fillText(`${min.toFixed(0)} ${unit}`, 10, h - 8);
    }

    let time = 0;
    function animate(){
      if(state.running){
        time += 0.035;
        const s = nextSample(time);
        push(state.pressureHistory, s.pressure);
        push(state.flowHistory, s.flow);
        push(state.volumeHistory, s.volume);
        drawWave('pressureCanvas', state.pressureHistory, '#5eead4', 0, 40, 'cmH₂O');
        drawWave('flowCanvas', state.flowHistory, '#7dd3fc', -6, 6, 'L/min');
        drawWave('volumeCanvas', state.volumeHistory, '#fbbf24', 0, 800, 'mL');
      }
      requestAnimationFrame(animate);
    }

    inputs.forEach(id => $(id).addEventListener('input', syncLabels));
    $('pauseBtn').addEventListener('click', () => {
      state.running = !state.running;
      $('pauseBtn').textContent = state.running ? 'Pausar' : 'Retomar';
    });
    $('resetBtn').addEventListener('click', () => {
      $('mode').value = 'vcv'; $('rr').value = 14; $('vt').value = 450; $('peep').value = 8; $('fio2').value = 40; $('itime').value = 1.0; $('compliance').value = 45; $('resistance').value = 12;
      state.pressureHistory = []; state.flowHistory = []; state.volumeHistory = [];
      syncLabels();
    });
    $('themeToggle').addEventListener('click', () => {
      state.theme = state.theme === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', state.theme);
      $('themeToggle').textContent = state.theme === 'dark' ? '🌙 Tema' : '☀️ Tema';
    });

    syncLabels();
    for(let i=0;i<state.samples;i++){
      const s = nextSample(i * 0.035);
      push(state.pressureHistory, s.pressure);
      push(state.flowHistory, s.flow);
      push(state.volumeHistory, s.volume);
    }
    animate();
  