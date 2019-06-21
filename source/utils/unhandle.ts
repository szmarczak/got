import EventEmitter = require('events');

type Origin = EventEmitter;
type Event = string | symbol;
type Fn = (...args: unknown[]) => void;

interface Handler {
	origin: Origin;
	event: Event;
	fn: Fn;
}

interface Unhandler {
	once: (origin: Origin, event: Event, fn: Fn) => void;
	unhandleAll: () => void;
}

export default (): Unhandler => {
	const handlers: Handler[] = [];

	return {
		once(origin: Origin, event: Event, fn: Fn) {
			origin.once(event, fn);
			handlers.push({origin, event, fn});
		},

		unhandleAll() {
			for (const handler of handlers) {
				const {origin, event, fn} = handler;
				origin.removeListener(event, fn);
			}
		}
	};
};
