export interface Moment {
    id: string;
    name: string;
    date: Date;
    callback: () => void | Promise<void>;
    description?: string;
    tags?: string[];
}

export class Timeline {
    private moments: Map<string, Moment[]> = new Map();
    private currentDate: Date;

    constructor(startDate?: Date) {
        this.currentDate = new Date(startDate ?? new Date());
    }

    registerMoment(moment: Moment): void {
        const dateKey = this.getDateKey(moment.date);
        if (!this.moments.has(dateKey)) {
            this.moments.set(dateKey, []);
        }
        this.moments.get(dateKey)!.push(moment);
    }

    removeMoment(momentId: string): boolean {
        for (const [dateKey, momentList] of this.moments.entries()) {
            const index = momentList.findIndex(moment => moment.id === momentId);
            if (index !== -1) {
                momentList.splice(index, 1);
                if (momentList.length === 0) {
                    this.moments.delete(dateKey);
                }
                return true;
            }
        }
        return false;
    }

    getMomentsForDate(date: Date): Moment[] {
        const dateKey = this.getDateKey(date);
        return this.moments.get(dateKey) || [];
    }

    getMomentsByTag(tag: string): Moment[] {
        const allMoments: Moment[] = [];
        for (const momentList of this.moments.values()) {
            const taggedMoments = momentList.filter(moment =>
                moment.tags?.includes(tag)
            );
            allMoments.push(...taggedMoments);
        }
        return allMoments;
    }

    getCurrentDate(): Date {
        return new Date(this.currentDate);
    }

    advanceTime(days: number): Moment[] {
        const triggeredMoments: Moment[] = [];

        for (let i = 0; i < days; i++) {
            this.currentDate.setDate(this.currentDate.getDate() + 1);
            const momentsToday = this.getMomentsForDate(this.currentDate);
            triggeredMoments.push(...momentsToday);
        }

        return triggeredMoments;
    }

    async fireMoments(moments: Moment[]): Promise<void> {
        for (const moment of moments) {
            try {
                await moment.callback();
            } catch (error) {
                console.error(`Error firing moment ${moment.id}: ${moment.description ?? 'No description'}`, error);
            }
        }
    }

    private getDateKey(date: Date): string {
        return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
    }
}