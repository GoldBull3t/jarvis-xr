/**
 * Serviço de Voz Determinístico do JARVIS XR (Web Speech API + Síntese Vocal)
 * 100% Determinístico — Sem LLMs, Sem Chamadas a APIs de IA Generativa.
 */

export type SpeechServiceState = 'idle' | 'requesting' | 'listening' | 'processing' | 'error';

export interface SpeechCapabilities {
  recognition: boolean;
  synthesis: boolean;
  availableVoicesCount: number;
  hasPtPtVoice: boolean;
}

export class JarvisSpeechService {
  private recognition: any = null;
  private isListening: boolean = false;
  private state: SpeechServiceState = 'idle';
  private selectedVoice: SpeechSynthesisVoice | null = null;
  private audioCtx: AudioContext | null = null;

  // Callbacks
  public onStateChange?: (state: SpeechServiceState, message?: string) => void;
  public onTranscript?: (text: string, isFinal: boolean) => void;
  public onError?: (error: string) => void;

  constructor() {
    this.initRecognition();
    this.initSynthesis();
  }

  private initRecognition() {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      return;
    }

    try {
      this.recognition = new SpeechRecognition();
      this.recognition.lang = 'pt-PT'; // Português de Portugal
      this.recognition.continuous = false;
      this.recognition.interimResults = true;
      this.recognition.maxAlternatives = 1;

      this.recognition.onstart = () => {
        this.isListening = true;
        this.setState('listening', 'A escutar em Português (pt-PT)...');
        this.playTacticalChime(880, 0.08); // Som de ativação
      };

      this.recognition.onresult = (event: any) => {
        if (!event.results || event.results.length === 0) return;
        const result = event.results[0];
        const transcript = result[0].transcript;
        const isFinal = result.isFinal;

        if (this.onTranscript) {
          this.onTranscript(transcript, isFinal);
        }
      };

      this.recognition.onerror = (event: any) => {
        this.isListening = false;
        const errType = event.error;
        let userMsg = `Erro de áudio: ${errType}`;

        if (errType === 'not-allowed') {
          userMsg = 'Permissão de microfone negada. Autorize o microfone no Meta Quest Browser.';
        } else if (errType === 'no-speech') {
          userMsg = 'Nenhum som detetado.';
        }

        this.setState('error', userMsg);
        if (this.onError) this.onError(userMsg);
        this.playTacticalChime(330, 0.15); // Som de erro
      };

      this.recognition.onend = () => {
        this.isListening = false;
        if (this.state === 'listening') {
          this.setState('idle', 'Escuta terminada.');
          this.playTacticalChime(660, 0.08); // Som de fecho
        }
      };
    } catch (e) {
      console.warn('Falha ao instanciar Web Speech Recognition:', e);
    }
  }

  private initSynthesis() {
    if (!('speechSynthesis' in window)) return;

    const loadVoices = () => {
      const voices = window.speechSynthesis.getVoices();
      // Prioridade: 1) pt-PT (Portugal), 2) pt-BR, 3) qualquer voz que comece por pt
      const ptPt = voices.find(v => v.lang === 'pt-PT' || v.lang === 'pt_PT');
      const ptGeneric = voices.find(v => v.lang.startsWith('pt'));
      this.selectedVoice = ptPt || ptGeneric || null;
    };

    loadVoices();
    if (window.speechSynthesis.onvoiceschanged !== undefined) {
      window.speechSynthesis.onvoiceschanged = loadVoices;
    }
  }

  /**
   * Emite um tom tático futurista sintetizado via Web Audio API (sem ficheiros MP3 externos)
   */
  private playTacticalChime(freq: number, duration: number) {
    try {
      if (!this.audioCtx) {
        const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
        if (AudioContextClass) this.audioCtx = new AudioContextClass();
      }
      if (!this.audioCtx) return;

      const osc = this.audioCtx.createOscillator();
      const gain = this.audioCtx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, this.audioCtx.currentTime);
      gain.gain.setValueAtTime(0.08, this.audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.audioCtx.currentTime + duration);

      osc.connect(gain);
      gain.connect(this.audioCtx.destination);

      osc.start();
      osc.stop(this.audioCtx.currentTime + duration);
    } catch {
      // Ignora falhas de áudio silenciosamente
    }
  }

  private setState(state: SpeechServiceState, message?: string) {
    this.state = state;
    if (this.onStateChange) {
      this.onStateChange(state, message);
    }
  }

  public getCapabilities(): SpeechCapabilities {
    const hasRecognition = !!this.recognition;
    const hasSynthesis = 'speechSynthesis' in window;
    const voices = hasSynthesis ? window.speechSynthesis.getVoices() : [];
    const hasPtPt = voices.some(v => v.lang === 'pt-PT' || v.lang === 'pt_PT');

    return {
      recognition: hasRecognition,
      synthesis: hasSynthesis,
      availableVoicesCount: voices.length,
      hasPtPtVoice: hasPtPt
    };
  }

  public isCurrentlyListening(): boolean {
    return this.isListening;
  }

  public startListening() {
    if (!this.recognition) {
      const msg = 'Reconhecimento vocal não suportado neste browser. Utilize os botões ou o teclado.';
      this.setState('error', msg);
      if (this.onError) this.onError(msg);
      return;
    }

    if (this.isListening) {
      return;
    }

    try {
      this.setState('requesting', 'A inicializar microfone...');
      this.recognition.start();
    } catch (err: any) {
      console.warn('Erro ao chamar recognition.start():', err);
    }
  }

  public stopListening() {
    if (this.recognition && this.isListening) {
      try {
        this.recognition.stop();
      } catch (err) {
        console.warn('Erro ao chamar recognition.stop():', err);
      }
    }
  }

  public cancelListening() {
    if (this.recognition && this.isListening) {
      try {
        this.recognition.abort();
        this.isListening = false;
        this.setState('idle', 'Operação de voz cancelada.');
      } catch (err) {
        console.warn('Erro ao chamar recognition.abort():', err);
      }
    }
  }

  /**
   * Síntese vocal de retorno (SpeechSynthesis)
   */
  public speak(text: string, options: { volume?: number; rate?: number } = {}) {
    if (!('speechSynthesis' in window)) return;

    try {
      window.speechSynthesis.cancel(); // Interrompe fala anterior
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'pt-PT';
      utterance.volume = options.volume ?? 1.0;
      utterance.rate = options.rate ?? 1.05;
      utterance.pitch = 0.95;

      if (this.selectedVoice) {
        utterance.voice = this.selectedVoice;
      }

      window.speechSynthesis.speak(utterance);
    } catch (e) {
      console.warn('Falha ao reproduzir síntese vocal:', e);
    }
  }

  public cancelSpeech() {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
  }
}

export const speechService = new JarvisSpeechService();
