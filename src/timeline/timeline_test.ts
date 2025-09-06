import { testRunner, assert } from '../test-runner.js';
import { Timeline, Moment } from './timeline.js';

testRunner.addTest('Timeline should register and retrieve moments', () => {
    const timeline = new Timeline(new Date('2024-01-01'));
    let momentFired = false;

    const moment: Moment = {
        id: 'test-1',
        name: 'Test Moment',
        date: new Date('2024-01-05'),
        resolved: false,
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
        resolved: false,
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
        resolved: false,
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
        resolved: false,
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
        resolved: false,
        callback: () => { },
        tags: ['work', 'meeting']
    };

    const moment2: Moment = {
        id: 'tagged-2',
        name: 'Personal Moment',
        date: new Date('2024-01-02'),
        resolved: false,
        callback: () => { },
        tags: ['personal']
    };

    timeline.registerMoment(moment1);
    timeline.registerMoment(moment2);

    const workMoments = timeline.getMomentsByTag('work');
    assert(workMoments.length === 1, 'Should find one work moment');
    assert(workMoments[0].id === 'tagged-1', 'Should find the correct work moment');
});

testRunner.addTest('Timeline should resolve moments', () => {
    const timeline = new Timeline();

    const moment: Moment = {
        id: 'resolve-test',
        name: 'Resolvable Moment',
        date: new Date('2024-01-01'),
        resolved: false,
        callback: () => { }
    };

    timeline.registerMoment(moment);

    const resolved = timeline.resolveMoment('resolve-test');
    const moments = timeline.getMomentsForDate(new Date('2024-01-01'));
    const unresolvedMoments = timeline.getUnresolvedMomentsForDate(new Date('2024-01-01'));

    assert(resolved === true, 'Should return true when moment is resolved');
    assert(moments[0].resolved === true, 'Moment should be marked as resolved');
    assert(unresolvedMoments.length === 0, 'Should have no unresolved moments');
});

testRunner.addTest('Timeline should filter unresolved moments', () => {
    const timeline = new Timeline();

    const moment1: Moment = {
        id: 'unresolved-1',
        name: 'Unresolved Moment',
        date: new Date('2024-01-01'),
        resolved: false,
        callback: () => { }
    };

    const moment2: Moment = {
        id: 'resolved-1',
        name: 'Resolved Moment',
        date: new Date('2024-01-01'),
        resolved: true,
        callback: () => { }
    };

    timeline.registerMoment(moment1);
    timeline.registerMoment(moment2);

    const allMoments = timeline.getMomentsForDate(new Date('2024-01-01'));
    const unresolvedMoments = timeline.getUnresolvedMomentsForDate(new Date('2024-01-01'));
    const allUnresolved = timeline.getUnresolvedMoments();

    assert(allMoments.length === 2, 'Should have 2 total moments');
    assert(unresolvedMoments.length === 1, 'Should have 1 unresolved moment for date');
    assert(allUnresolved.length === 1, 'Should have 1 unresolved moment total');
    assert(unresolvedMoments[0].id === 'unresolved-1', 'Should find the correct unresolved moment');
});

testRunner.addTest('Timeline should pass payload to callback when firing moments', async () => {
    const timeline = new Timeline();
    let receivedPayload: any = null;

    interface TaskPayload {
        priority: string;
        assignee: string;
    }

    const moment: Moment = {
        id: 'payload-test',
        name: 'Task with Payload',
        date: new Date('2024-01-01'),
        resolved: false,
        callback: (payload?: Record<string, any>) => {
            receivedPayload = payload;
        },
        payload: {
            priority: 'high',
            assignee: 'Alice'
        }
    };

    timeline.registerMoment(moment);
    const moments = timeline.getMomentsForDate(new Date('2024-01-01'));

    // Fire the moments using the timeline's fireMoments method
    await timeline.resolveMoments(moments);

    assert(receivedPayload !== null, 'Should receive payload');
    assert(receivedPayload.priority === 'high', 'Should have correct priority');
    assert(receivedPayload.assignee === 'Alice', 'Should have correct assignee');
});

testRunner.addTest('Timeline should advance to specific date', () => {
    const timeline = new Timeline(new Date('2024-01-01'));

    const moment1: Moment = {
        id: 'advance-test-1',
        name: 'Moment on Jan 5',
        date: new Date('2024-01-05'),
        resolved: false,
        callback: () => { }
    };

    const moment2: Moment = {
        id: 'advance-test-2',
        name: 'Moment on Jan 10',
        date: new Date('2024-01-10'),
        resolved: false,
        callback: () => { }
    };

    timeline.registerMoment(moment1);
    timeline.registerMoment(moment2);

    const triggeredMoments = timeline.advanceToDate(new Date('2024-01-07'));

    assert(triggeredMoments.length === 1, 'Should trigger one moment by Jan 7');
    assert(triggeredMoments[0].id === 'advance-test-1', 'Should trigger the Jan 5 moment');
    assert(timeline.getCurrentDate().getDate() === 7, 'Should be at Jan 7');
});