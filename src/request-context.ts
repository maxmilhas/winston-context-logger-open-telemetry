import { AsyncHooksContextManager } from '@opentelemetry/context-async-hooks';
import * as api from '@opentelemetry/api';
import { v4 } from 'uuid';
import { packageInfo } from './package-info';

const contextSymbol = Symbol('Context');
const contextManager = new AsyncHooksContextManager();
contextManager.enable();
api.context.setGlobalContextManager(contextManager);

export class RequestContext {
	readonly privateMeta: {
		[key: symbol]: object;
	} = {};

	constructor(public readonly correlationId: string) {}

	static setContext(
		routine: string,
		correlationId: string | undefined,
		callback: () => Promise<void>,
	) {
		const context = new RequestContext(correlationId || v4());
		return api.context.with(
			api.context.active().setValue(contextSymbol, context),
			async () => {
				const span = api.trace.getTracer(packageInfo.name).startSpan(routine);
				try {
					await callback();
				} finally {
					span.end();
				}
			},
		);
	}
}
