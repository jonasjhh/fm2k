interface ToastConfig {
  position?: string;
  duration?: number;
  maxToasts?: number;
  animationDuration?: number;
  spacing?: number;
  zIndex?: number;
  injectCSS?: boolean;
}

interface Toast {
  id: string;
  message: string;
  type: ToastType;
  duration: number;
  timestamp: number;
}

interface ActiveToast {
  id: string;
  element: HTMLElement;
  toast: Toast;
}

type ToastType = 'success' | 'error' | 'info' | 'warning';

export class ToastManager {
  private config: Required<ToastConfig>;
  private toastQueue: Toast[] = [];
  private activeToasts: ActiveToast[] = [];
  private isProcessing = false;
  private initialized = false;

  constructor(options: ToastConfig = {}) {
    this.config = {
      position: options.position ?? 'bottom-right',
      duration: options.duration ?? 4000,
      maxToasts: options.maxToasts ?? 5,
      animationDuration: options.animationDuration ?? 300,
      spacing: options.spacing ?? 10,
      zIndex: options.zIndex ?? 1000,
      injectCSS: options.injectCSS !== false,
      ...options,
    };

    if (typeof document !== 'undefined') {
      this.initialize();
    }
  }

  private initialize(): void {
    if (this.initialized) {return;}

    if (this.config.injectCSS) {
      this.injectCSS();
    }

    this.initialized = true;
  }

  show(message: string, type: ToastType = 'info', duration?: number | null): string {
    const toast: Toast = {
      id: this.generateId(),
      message: String(message),
      type: this.validateType(type),
      duration: duration ?? this.config.duration,
      timestamp: Date.now(),
    };

    this.toastQueue.push(toast);

    if (!this.isProcessing) {
      this.processQueue();
    }

    return toast.id;
  }

  success(message: string, duration?: number): string {
    return this.show(message, 'success', duration);
  }

  error(message: string, duration?: number): string {
    return this.show(message, 'error', duration);
  }

  info(message: string, duration?: number): string {
    return this.show(message, 'info', duration);
  }

  warning(message: string, duration?: number): string {
    return this.show(message, 'warning', duration);
  }

  private async processQueue(): Promise<void> {
    if (this.toastQueue.length === 0) {
      this.isProcessing = false;
      return;
    }

    this.isProcessing = true;

    while (this.activeToasts.length >= this.config.maxToasts) {
      await this.removeOldestToast();
    }

    const toast = this.toastQueue.shift();
    if (!toast) {
      return;
    }
    await this.displayToast(toast);

    globalThis.setTimeout(() => this.processQueue(), 50);
  }

  private async displayToast(toast: Toast): Promise<void> {
    const toastElement = this.createToastElement(toast);

    globalThis.document.body.appendChild(toastElement);

    this.activeToasts.push({
      id: toast.id,
      element: toastElement,
      toast: toast,
    });

    this.positionToast(toastElement);
    await this.animateIn(toastElement);

    if (toast.duration > 0) {
      globalThis.setTimeout(() => {
        this.removeToast(toast.id);
      }, toast.duration);
    }
  }

  private createToastElement(toast: Toast): HTMLElement {
    const element = globalThis.document.createElement('div');
    element.className = `toast toast-${toast.type}`;
    element.setAttribute('data-toast-id', toast.id);

    if (toast.duration <= 0 || toast.type === 'error') {
      element.innerHTML = `
        <span class="toast-message">${this.escapeHtml(toast.message)}</span>
        <button class="toast-close" data-toast-id="${toast.id}">&times;</button>
      `;
      const closeBtn = element.querySelector('.toast-close');
      closeBtn?.addEventListener('click', (e) => {
        e.stopPropagation();
        this.removeToast(toast.id);
      });
    } else {
      element.innerHTML = `
        <span class="toast-message">${this.escapeHtml(toast.message)}</span>
      `;
    }

    element.addEventListener('click', () => {
      this.removeToast(toast.id);
    });

    return element;
  }

  private positionToast(toastElement: HTMLElement): void {
    const [vAlign, hAlign] = this.config.position.split('-');

    let offset = 0;
    this.activeToasts.forEach(activeToast => {
      if (activeToast.element !== toastElement) {
        offset += activeToast.element.offsetHeight + this.config.spacing;
      }
    });

    toastElement.style.position = 'fixed';
    toastElement.style.zIndex = String(this.config.zIndex);

    if (vAlign === 'top') {
      toastElement.style.top = `${this.config.spacing + offset}px`;
    } else {
      toastElement.style.bottom = `${this.config.spacing + offset}px`;
    }

    if (hAlign === 'left') {
      toastElement.style.left = `${this.config.spacing}px`;
    } else if (hAlign === 'center') {
      toastElement.style.left = '50%';
      toastElement.style.transform = 'translateX(-50%)';
    } else {
      toastElement.style.right = `${this.config.spacing}px`;
    }
  }

  private async animateIn(toastElement: HTMLElement): Promise<void> {
    return new Promise(resolve => {
      toastElement.style.opacity = '0';
      toastElement.style.transform += ' translateY(20px)';

      globalThis.requestAnimationFrame(() => {
        toastElement.style.transition = `all ${this.config.animationDuration}ms ease`;
        toastElement.style.opacity = '1';
        toastElement.style.transform = toastElement.style.transform.replace('translateY(20px)', '');

        globalThis.setTimeout(resolve, this.config.animationDuration);
      });
    });
  }

  private async animateOut(toastElement: HTMLElement): Promise<void> {
    return new Promise(resolve => {
      toastElement.style.transition = `all ${this.config.animationDuration}ms ease`;
      toastElement.style.opacity = '0';
      toastElement.style.transform += ' translateY(-20px)';

      globalThis.setTimeout(() => {
        if (toastElement.parentNode) {
          toastElement.parentNode.removeChild(toastElement);
        }
        resolve();
      }, this.config.animationDuration);
    });
  }

  async removeToast(toastId: string): Promise<void> {
    const activeToastIndex = this.activeToasts.findIndex(t => t.id === toastId);

    if (activeToastIndex === -1) {return;}

    const activeToast = this.activeToasts[activeToastIndex];

    this.activeToasts.splice(activeToastIndex, 1);
    await this.animateOut(activeToast.element);
    this.repositionToasts();
  }

  private async removeOldestToast(): Promise<void> {
    if (this.activeToasts.length > 0) {
      await this.removeToast(this.activeToasts[0].id);
    }
  }

  private repositionToasts(): void {
    this.activeToasts.forEach((activeToast) => {
      this.positionToast(activeToast.element);
    });
  }

  async clearAll(): Promise<void> {
    const toastIds = this.activeToasts.map(t => t.id);
    await Promise.all(toastIds.map(id => this.removeToast(id)));
    this.toastQueue = [];
  }

  configure(newConfig: ToastConfig): void {
    this.config = { ...this.config, ...newConfig };
  }

  private generateId(): string {
    return `toast-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  private validateType(type: string): ToastType {
    const validTypes: ToastType[] = ['success', 'error', 'info', 'warning'];
    return validTypes.includes(type as ToastType) ? type as ToastType : 'info';
  }

  private escapeHtml(text: string): string {
    const map: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      '\'': '&#039;',
    };
    return text.replace(/[&<>"']/g, m => map[m]);
  }

  private injectCSS(): void {
    if (globalThis.document.querySelector('#toast-manager-styles')) {return;}

    const styles = `
      .toast {
        min-width: 250px;
        max-width: 400px;
        padding: 12px 16px;
        margin: 0;
        border-radius: 6px;
        color: #fff;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        font-size: 14px;
        font-weight: 500;
        line-height: 1.4;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
        cursor: pointer;
        user-select: none;
        display: flex;
        align-items: center;
        justify-content: space-between;
        word-wrap: break-word;
        transition: all 300ms ease;
      }

      .toast:hover {
        opacity: 0.9;
        transform: scale(1.02);
      }

      .toast-message {
        flex: 1;
        margin-right: 8px;
      }

      .toast-close {
        background: none;
        border: none;
        color: inherit;
        font-size: 18px;
        cursor: pointer;
        padding: 0;
        margin-left: 8px;
        opacity: 0.7;
        transition: opacity 150ms ease;
        width: 20px;
        height: 20px;
        display: flex;
        align-items: center;
        justify-content: center;
      }

      .toast-close:hover {
        opacity: 1;
      }

      .toast-success {
        background: linear-gradient(135deg, #28a745, #20c997);
      }

      .toast-error {
        background: linear-gradient(135deg, #dc3545, #e74c3c);
      }

      .toast-info {
        background: linear-gradient(135deg, #17a2b8, #3498db);
      }

      .toast-warning {
        background: linear-gradient(135deg, #ffc107, #f39c12);
        color: #212529;
      }

      @media (max-width: 480px) {
        .toast {
          min-width: calc(100vw - 40px);
          max-width: calc(100vw - 40px);
          margin: 0 20px;
        }
      }
    `;

    const styleSheet = globalThis.document.createElement('style');
    styleSheet.id = 'toast-manager-styles';
    styleSheet.textContent = styles;
    globalThis.document.head.appendChild(styleSheet);
  }
}

export function createToastManager(options: ToastConfig = {}): ToastManager {
  return new ToastManager(options);
}

export const toastManager = new ToastManager();
