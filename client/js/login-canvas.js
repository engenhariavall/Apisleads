/**
 * VERSUS ENTERPRISE - ENGINE DE AMBIENTE 3D & PARALLAX LERP
 * Canvas Geodésico Interativo de Dados & Gestão de Autenticação
 * 
 * Cores do Design System:
 * - Espaço Profundo: #050814
 * - Base Card: #0B1224
 * - Destaques / Nós / Ações: #0055FF (Cobalto) & #00D2FF (Ciano Elétrico)
 */

(function () {
  'use strict';

  // A tela de login é sempre apresentada limpa para que o usuário informe suas credenciais ou troque de conta

  // --------------------------------------------------------------------------
  // 1. CONFIGURAÇÃO DO CANVAS & FÍSICA DE PARTÍCULAS 3D
  // --------------------------------------------------------------------------
  const canvas = document.getElementById('canvasBackground');
  if (!canvas) return;

  const ctx = canvas.getContext('2d');
  let width = 0;
  let height = 0;
  let dpr = 1;

  // Parâmetros de Câmera e Perspectiva 3D
  const FOV = 480;
  const PARTICLE_COUNT = 110;
  const MAX_CONNECT_DIST = 125;
  const BOUND_X = 700;
  const BOUND_Y = 500;
  const BOUND_Z = 600;

  // Estado do Mouse & Parallax LERP
  const mouse = {
    x: 0,
    y: 0,
    targetX: 0,
    targetY: 0,
    lerpX: 0,
    lerpY: 0,
    isHovering: false,
    radius: 160
  };

  // Matriz de Partículas no Espaço 3D
  const particles = [];

  class Particle3D {
    constructor() {
      this.reset(true);
    }

    reset(initial = false) {
      this.x = (Math.random() - 0.5) * BOUND_X * 2;
      this.y = (Math.random() - 0.5) * BOUND_Y * 2;
      this.z = initial ? (Math.random() - 0.5) * BOUND_Z * 2 : BOUND_Z;

      // Velocidade de deriva orgânica
      this.vx = (Math.random() - 0.5) * 0.45;
      this.vy = (Math.random() - 0.5) * 0.45;
      this.vz = -(0.25 + Math.random() * 0.45); // Move-se suavemente em direção à câmera

      // Raio base e cor
      this.baseRadius = 1.4 + Math.random() * 1.8;
      this.isHub = Math.random() > 0.88; // Nós mestres mais brilhantes
      this.colorType = Math.random() > 0.45 ? 'cyan' : 'cobalt';
      this.pulsePhase = Math.random() * Math.PI * 2;
    }

    update() {
      this.x += this.vx;
      this.y += this.vy;
      this.z += this.vz;
      this.pulsePhase += 0.03;

      // Recicla partícula ao ultrapassar o plano frontal ou limites
      if (this.z < -BOUND_Z * 0.7 || Math.abs(this.x) > BOUND_X * 1.3 || Math.abs(this.y) > BOUND_Y * 1.3) {
        this.reset(false);
      }
    }

    project(rotX, rotY, cx, cy) {
      // Aplica Rotação Parallax nos eixos X e Y
      const cosY = Math.cos(rotY);
      const sinY = Math.sin(rotY);
      const cosX = Math.cos(rotX);
      const sinX = Math.sin(rotX);

      // Rotação Y
      const x1 = this.x * cosY + this.z * sinY;
      const z1 = -this.x * sinY + this.z * cosY;

      // Rotação X
      const y2 = this.y * cosX - z1 * sinX;
      const z2 = this.y * sinX + z1 * cosX;

      // Projeção em Perspectiva
      const cameraDistance = 650;
      const effectiveZ = z2 + cameraDistance;

      if (effectiveZ <= 10) return null;

      const scale = FOV / effectiveZ;
      const screenX = cx + x1 * scale;
      const screenY = cy + y2 * scale;

      return {
        x: screenX,
        y: screenY,
        scale: scale,
        depth: effectiveZ,
        origZ: z2
      };
    }
  }

  // Inicializa partículas
  function initParticles() {
    particles.length = 0;
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      particles.push(new Particle3D());
    }
  }

  // Ajuste de Resolução com suporte a High-DPI / Retina
  function resizeCanvas() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    width = window.innerWidth;
    height = window.innerHeight;

    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
    canvas.style.width = width + 'px';
    canvas.style.height = height + 'px';

    ctx.scale(dpr, dpr);
  }

  window.addEventListener('resize', () => {
    resizeCanvas();
  });

  // Rastreamento de Movimento do Cursor do Mouse
  window.addEventListener('mousemove', (e) => {
    // Normalizado de -1 a 1 em relação ao centro da tela
    mouse.targetX = (e.clientX / width - 0.5) * 2;
    mouse.targetY = (e.clientY / height - 0.5) * 2;
    mouse.x = e.clientX;
    mouse.y = e.clientY;
    mouse.isHovering = true;
  });

  window.addEventListener('mouseleave', () => {
    mouse.targetX = 0;
    mouse.targetY = 0;
    mouse.isHovering = false;
  });

  // Efeito de Parallax Card Tilt Sutil
  const loginCard = document.querySelector('.glass-login-card');

  // Loop de Renderização Principal
  let animationFrameId = null;

  function render() {
    // 1. Interpolação Linear (LERP) do Movimento do Mouse
    // Fator LERP de 0.05 para resposta fluida e orgânica
    mouse.lerpX += (mouse.targetX - mouse.lerpX) * 0.05;
    mouse.lerpY += (mouse.targetY - mouse.lerpY) * 0.05;

    // Aplica inclinação sutil 3D ao cartão de vidro
    if (loginCard && mouse.isHovering) {
      const tiltX = -mouse.lerpY * 6; // Max 6 graus
      const tiltY = mouse.lerpX * 8;  // Max 8 graus
      loginCard.style.transform = `perspective(1000px) rotateX(${tiltX.toFixed(2)}deg) rotateY(${tiltY.toFixed(2)}deg)`;
    } else if (loginCard && !mouse.isHovering) {
      loginCard.style.transform = '';
    }

    // 2. Limpeza do Frame com Fundo Espaço Profundo (#050814)
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = '#050814';
    ctx.fillRect(0, 0, width, height);

    // Aura central sutil de profundidade
    const centerGradient = ctx.createRadialGradient(
      width * 0.5, height * 0.45, 10,
      width * 0.5, height * 0.45, Math.max(width, height) * 0.75
    );
    centerGradient.addColorStop(0, 'rgba(11, 18, 36, 0.65)');
    centerGradient.addColorStop(0.5, 'rgba(7, 12, 28, 0.9)');
    centerGradient.addColorStop(1, '#050814');
    ctx.fillStyle = centerGradient;
    ctx.fillRect(0, 0, width, height);

    const cx = width / 2;
    const cy = height / 2;

    // Ângulos de rotação em função do LERP
    const rotY = mouse.lerpX * 0.35;
    const rotX = -mouse.lerpY * 0.28;

    // 3. Projeção e Atualização de Nós
    const projected = [];
    for (let i = 0; i < particles.length; i++) {
      const p = particles[i];
      p.update();
      const proj = p.project(rotX, rotY, cx, cy);
      if (proj && proj.x >= -60 && proj.x <= width + 60 && proj.y >= -60 && proj.y <= height + 60) {
        projected.push({ p, proj });
      }
    }

    // Ordenação por profundidade (Z-sort) para renderização correta
    projected.sort((a, b) => b.proj.depth - a.proj.depth);

    // 4. Renderização das Linhas Conectivas (Malha Geodésica de Dados)
    ctx.lineWidth = 0.9;
    const pLen = projected.length;

    for (let i = 0; i < pLen; i++) {
      const p1 = projected[i];

      // Conecta com nós próximos
      for (let j = i + 1; j < pLen; j++) {
        const p2 = projected[j];
        const dx = p1.proj.x - p2.proj.x;
        const dy = p1.proj.y - p2.proj.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < MAX_CONNECT_DIST) {
          const alphaFactor = (1 - dist / MAX_CONNECT_DIST);
          const depthAlpha = Math.min(p1.proj.scale, p2.proj.scale) * 1.1;
          const finalAlpha = Math.max(0, Math.min(alphaFactor * depthAlpha * 0.38, 0.32));

          ctx.beginPath();
          ctx.moveTo(p1.proj.x, p1.proj.y);
          ctx.lineTo(p2.proj.x, p2.proj.y);

          // Alterna sutileza entre Cobalto (#0055FF) e Ciano (#00D2FF)
          if (p1.p.colorType === 'cyan' || p2.p.colorType === 'cyan') {
            ctx.strokeStyle = `rgba(0, 210, 255, ${finalAlpha})`;
          } else {
            ctx.strokeStyle = `rgba(0, 85, 255, ${finalAlpha * 1.2})`;
          }
          ctx.stroke();
        }
      }
    }

    // 5. Renderização dos Pontos de Luz / Partículas
    for (let i = 0; i < pLen; i++) {
      const { p, proj } = projected[i];
      const scale = proj.scale;
      const pulse = 1 + Math.sin(p.pulsePhase) * 0.2;
      const radius = Math.max(0.7, p.baseRadius * scale * pulse);

      // Interação de proximidade com o cursor do mouse
      let proximityBoost = 0;
      if (mouse.isHovering) {
        const mdx = proj.x - mouse.x;
        const mdy = proj.y - mouse.y;
        const mDist = Math.sqrt(mdx * mdx + mdy * mdy);
        if (mDist < mouse.radius) {
          proximityBoost = (1 - mDist / mouse.radius) * 0.6;
        }
      }

      ctx.beginPath();
      ctx.arc(proj.x, proj.y, radius, 0, Math.PI * 2);

      const baseAlpha = Math.min(1, scale * 1.2 + proximityBoost);

      if (p.isHub || proximityBoost > 0.2) {
        // Ponto de Alta Intensidade com Glow
        ctx.shadowColor = '#00D2FF';
        ctx.shadowBlur = 10 * scale;
        ctx.fillStyle = `rgba(255, 255, 255, ${Math.min(1, baseAlpha + 0.2)})`;
        ctx.fill();

        // Anel orbital de emissão para Hubs
        if (p.isHub) {
          ctx.beginPath();
          ctx.arc(proj.x, proj.y, radius * 2.2, 0, Math.PI * 2);
          ctx.strokeStyle = `rgba(0, 210, 255, ${(baseAlpha * 0.45).toFixed(3)})`;
          ctx.lineWidth = 0.8;
          ctx.stroke();
        }
        ctx.shadowBlur = 0;
      } else if (p.colorType === 'cyan') {
        ctx.fillStyle = `rgba(0, 210, 255, ${baseAlpha.toFixed(3)})`;
        ctx.fill();
      } else {
        ctx.fillStyle = `rgba(0, 85, 255, ${baseAlpha.toFixed(3)})`;
        ctx.fill();
      }
    }

    animationFrameId = requestAnimationFrame(render);
  }

  // --------------------------------------------------------------------------
  // 2. INICIALIZAÇÃO DO CANVAS
  // --------------------------------------------------------------------------
  resizeCanvas();
  initParticles();
  render();

  // --------------------------------------------------------------------------
  // 3. LÓGICA DE SUBMISSÃO & AUTENTICAÇÃO VERSUS (POST /api/auth/login)
  // --------------------------------------------------------------------------
  const formLogin = document.getElementById('formLogin');
  const inputEmail = document.getElementById('inputEmail');
  const inputPassword = document.getElementById('inputPassword');
  const btnSubmit = document.getElementById('btnSubmit');
  const btnText = document.getElementById('btnText');
  const btnSpinner = document.getElementById('btnSpinner');
  const formFeedback = document.getElementById('formFeedback');
  const btnQuickFillMaster = document.getElementById('btnQuickFillMaster');

  // Preenchimento de Demonstração / Master (hajaluzstudio@gmail.com)
  if (btnQuickFillMaster && inputEmail && inputPassword) {
    btnQuickFillMaster.addEventListener('click', () => {
      inputEmail.value = 'hajaluzstudio@gmail.com';
      inputPassword.value = 'sophia11052016';
      inputEmail.dispatchEvent(new Event('input', { bubbles: true }));
      inputPassword.dispatchEvent(new Event('input', { bubbles: true }));
      inputEmail.dispatchEvent(new Event('change', { bubbles: true }));
      inputPassword.dispatchEvent(new Event('change', { bubbles: true }));
      if (btnSubmit) btnSubmit.disabled = false;
      if (formFeedback) formFeedback.style.display = 'none';
      inputPassword.focus();
    });
  }

  // Feedback de Erro
  function showError(message) {
    if (!formFeedback) return;
    formFeedback.textContent = message;
    formFeedback.style.display = 'block';

    // Micro shake animation no card
    if (loginCard) {
      loginCard.style.animation = 'none';
      void loginCard.offsetWidth; // Força reflow
      loginCard.style.animation = 'zeroGravity 7s ease-in-out infinite, shakeError 0.35s ease';
    }
  }

  function clearError() {
    if (!formFeedback) return;
    formFeedback.style.display = 'none';
    formFeedback.textContent = '';
  }

  // Submissão do Formulário
  if (formLogin) {
    formLogin.addEventListener('submit', async (e) => {
      e.preventDefault();
      clearError();

      const email = inputEmail?.value?.trim();
      const password = inputPassword?.value;

      if (!email || !password) {
        showError('Preencha as credenciais corporativas completas.');
        return;
      }

      // Estado de Carregamento
      if (btnSubmit) btnSubmit.disabled = true;
      if (btnText) btnText.textContent = 'Autenticando...';
      if (btnSpinner) btnSpinner.style.display = 'inline-block';

      try {
        const response = await fetch('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password })
        });

        const data = await response.json();

        if (!response.ok || !data.success) {
          throw new Error(data.error || 'Credenciais corporativas inválidas ou conta inativa.');
        }

        // Armazena Token e Informações da Sessão
        if (data.token) {
          localStorage.setItem('versus_token', data.token);
        }
        if (data.user) {
          localStorage.setItem('versus_user', JSON.stringify(data.user));
          localStorage.setItem('versus_role', data.user.role || '');
        }

        // Feedback Visual de Sucesso
        if (btnText) btnText.textContent = 'Acesso Autorizado';
        if (btnSubmit) {
          btnSubmit.style.background = 'linear-gradient(135deg, #00D2FF 0%, #0055FF 100%)';
          btnSubmit.style.boxShadow = '0 0 25px rgba(0, 210, 255, 0.7)';
        }

        // ETAPA 2: Controle Estrito de Roteamento Pós-Login baseado em Roles
        const userRole = data.user?.role;
        const urlParams = new URLSearchParams(window.location.search);
        let explicitRedirect = urlParams.get('redirect');

        // Blindagem: impede que usuários sem permissão caiam na rota administrativa
        if (explicitRedirect && (explicitRedirect.includes('admin') || explicitRedirect === '/admin') && userRole !== 'SUPER_ADMIN') {
          explicitRedirect = '/';
        }

        let targetUrl = '/';
        let transitionMessages = [
          'Credencial corporativa autorizada...',
          'Sincronizando parâmetros analíticos...',
          'Iniciando API Leads...'
        ];

        if (userRole === 'SUPER_ADMIN' && (!explicitRedirect || explicitRedirect === '/admin' || explicitRedirect === '/admin.html')) {
          targetUrl = '/admin.html';
          transitionMessages = [
            'Autenticação Master validada...',
            'Estabelecendo conexão com cluster seguro...',
            'Iniciando Cockpit de Governança...'
          ];
        } else if (explicitRedirect) {
          targetUrl = explicitRedirect;
        }

        setTimeout(() => {
          if (window.VersusPreloader) {
            window.VersusPreloader.transitionTo(targetUrl, transitionMessages, 1600);
          } else {
            window.location.replace(targetUrl);
          }
        }, 400);

      } catch (err) {
        showError(err.message || 'Falha na conexão com o servidor de autenticação.');
        if (btnSubmit) btnSubmit.disabled = false;
        if (btnText) btnText.textContent = 'Acessar Plataforma';
        if (btnSpinner) btnSpinner.style.display = 'none';
      }
    });
  }

})();
