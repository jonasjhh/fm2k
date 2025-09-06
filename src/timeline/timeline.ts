export interface Moment {
    id: string;
    name: string;
    date: Date;
    resolved: boolean;
    callback: (payload?: Record<string, any>) => void | Promise<void>;
    payload?: Record<string, any>;
    description?: string;
    tags?: string[];
}

export class Timeline {
    private moments = new Map<string, Moment[]>();
    private currentDate: Date;

    constructor(startDate: Date = new Date()) {
        this.currentDate = new Date(startDate);
    }

    registerMoment(moment: Moment): void {
        const dateKey = this.getDateKey(moment.date);
        const momentList = this.moments.get(dateKey) ?? [];
        momentList.push(moment);
        this.moments.set(dateKey, momentList);
    }

    removeMoment(momentId: string): boolean {
        for (const [dateKey, momentList] of this.moments) {
            const index = momentList.findIndex(m => m.id === momentId);
            if (index !== -1) {
                momentList.splice(index, 1);
                if (momentList.length === 0) this.moments.delete(dateKey);
                return true;
            }
        }
        return false;
    }

    resolveMoment(momentId: string): boolean {
        for (const momentList of this.moments.values()) {
            const moment = momentList.find(m => m.id === momentId);
            if (moment) {
                moment.resolved = true;
                return true;
            }
        }
        return false;
    }

    getMomentsForDate(date: Date): Moment[] {
        return this.moments.get(this.getDateKey(date)) ?? [];
    }

    getUnresolvedMomentsForDate(date: Date): Moment[] {
        return this.getMomentsForDate(date).filter(m => !m.resolved);
    }

    getMomentsByTag(tag: string): Moment[] {
        return [...this.moments.values()].flat().filter(m => m.tags?.includes(tag));
    }

    getUnresolvedMoments(): Moment[] {
        return [...this.moments.values()].flat().filter(m => !m.resolved);
    }

    getCurrentDate(): Date {
        return new Date(this.currentDate);
    }

    advanceTime(days: number): Moment[] {
        const triggered: Moment[] = [];
        for (let i = 0; i < days; i++) {
            this.currentDate.setDate(this.currentDate.getDate() + 1);
            triggered.push(...this.getMomentsForDate(this.currentDate));
        }
        return triggered;
    }

    async fireMoments(moments: Moment[]): Promise<void> {
        for (const moment of moments) {
            try {
                await moment.callback(moment.payload);
            } catch (error) {
                console.error(`Error firing moment ${moment.id}: ${moment.description ?? 'No description'}`, error);
            }
        }
    }

    private getDateKey(date: Date): string {
        return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
    }
}
