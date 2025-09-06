import { testRunner, assert } from '../test-runner.js';
import { Timeline, Moment } from './timeline.js';

testRunner.addTest('Timeline should register and retrieve moments', () => {
    const timeline = new Timeline(new Date('2024-01-01'));
    let momentFired = false;

    const moment: Moment = {
        id: 'test-1',
        name: 'Test Moment',
        date: new Date('2024-01-05'),
        callback: () => { momentFired = true; }
    };

    timeline.registerMoment(moment);
    const moments = timeline.getMomentsForDate(new Date('2024-01-05'));

    assert(moments.length === 1, 'Should have one moment registered');
    assert(moments[0].id === 'test-1', 'Should retrieve the correct moment');
});

testRunner.addTest('Timeline should advance time and trigger moments', () => {
    const timeline = new Timeline(new Date('2024-01-01'));
    let momentFired = false;

    const moment: Moment = {
        id: 'test-2',
        name: 'Future Moment',
        date: new Date('2024-01-03'),
        callback: () => { momentFired = true; }
    };

    timeline.registerMoment(moment);
    const triggeredMoments = timeline.advanceTime(3);

    assert(triggeredMoments.length === 1, 'Should trigger one moment');
    assert(triggeredMoments[0].id === 'test-2', 'Should trigger the correct moment');
});

testRunner.addTest('Timeline should remove moments by id', () => {
    const timeline = new Timeline();

    const moment: Moment = {
        id: 'remove-test',
        name: 'Moment to Remove',
        date: new Date('2024-01-01'),
        callback: () => { }
    };

    timeline.registerMoment(moment);
    const removed = timeline.removeMoment('remove-test');
    const moments = timeline.getMomentsForDate(new Date('2024-01-01'));

    assert(removed === true, 'Should return true when moment is removed');
    assert(moments.length === 0, 'Should have no moments after removal');
});

testRunner.addTest('Timeline should handle optional description and tags', () => {
    const timeline = new Timeline(new Date('2024-01-01'));

    const moment: Moment = {
        id: 'optional-test',
        name: 'Moment with Optional Fields',
        date: new Date('2024-01-05'),
        callback: () => { },
        description: 'A moment with a description',
        tags: ['work', 'important']
    };

    timeline.registerMoment(moment);
    const moments = timeline.getMomentsForDate(new Date('2024-01-05'));

    assert(moments[0].description === 'A moment with a description', 'Should have description');
    assert(moments[0].tags?.length === 2, 'Should have 2 tags');
    assert(moments[0].tags !== undefined && moments[0].tags.includes('work'), 'Should include work tag');
});

testRunner.addTest('Timeline should find moments by tag', () => {
    const timeline = new Timeline();

    const moment1: Moment = {
        id: 'tagged-1',
        name: 'Work Moment',
        date: new Date('2024-01-01'),
        callback: () => { },
        tags: ['work', 'meeting']
    };

    const moment2: Moment = {
        id: 'tagged-2',
        name: 'Personal Moment',
        date: new Date('2024-01-02'),
        callback: () => { },
        tags: ['personal']
    };

    timeline.registerMoment(moment1);
    timeline.registerMoment(moment2);

    const workMoments = timeline.getMomentsByTag('work');
    assert(workMoments.length === 1, 'Should find one work moment');
    assert(workMoments[0].id === 'tagged-1', 'Should find the correct work moment');
});