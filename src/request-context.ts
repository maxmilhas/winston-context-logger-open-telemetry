import * as api from '@opentelemetry/api';
import { v4 } from 'uuid';
import { packageInfo } from './package-info';
import { ContextInfoProvider } from 'winston-context-logger';
import * as nodeCleanup from 'node-cleanup';

const onContextEndList: Array<() => void> = [];
const contextSymbol = Symbol('Context');
export class RequestContext {
	readonly privateMeta: {
		[key: symbol]: object;
	} = {};

	constructor(public readonly correlationId: string) {}

	static setContext(
		routine: string,
		correlationId: string | undefined,
		callback: () => Promise<void>,
		initialize?: () => void,
	) {
		const context = new RequestContext(correlationId || v4());
		return api.context.with(
			api.context.active().setValue(contextSymbol, context),
			async () => {
				const span = api.trace.getTracer(packageInfo.name).startSpan(routine);
				try {
					initialize?.();
					await callback();
				} finally {
					span.end();
					this.flush();
				}
			},
		);
	}

	static flush() {
		onContextEndList.forEach((callback) => {
			try {
				callback();
			} catch (error) {
				console.error(`Error when calling context end callback ${error.stack}`);
			}
		});
	}
}
const loggerContextSymbol = Symbol('CoggerContext');

export class OpenTelemetryContextProvider<T extends object>
	implements ContextInfoProvider<T>
{
	private readonly rootContext = new RequestContext('root');

	currentContext() {
		return (
			(api.context.active().getValue(contextSymbol) as RequestContext) ||
			this.rootContext
		);
	}

	get correlationId() {
		return this.currentContext().correlationId;
	}

	getContextInfo() {
		return this.currentContext().privateMeta[loggerContextSymbol];
	}
	setContextInfo(value: object) {
		this.currentContext().privateMeta[loggerContextSymbol] = value;
	}

	onContextEnd(callback: () => void): void {
		onContextEndList.push(callback);
	}
}

nodeCleanup(RequestContext.flush.bind(RequestContext));
