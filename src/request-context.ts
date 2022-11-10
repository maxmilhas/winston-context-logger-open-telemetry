import * as api from '@opentelemetry/api';
import { v4 } from 'uuid';
import { packageInfo } from './package-info';
import { ContextInfoProvider } from 'winston-context-logger';
import * as nodeCleanup from 'node-cleanup';

const onContextEndList: Array<(routine?: string) => void> = [];
const contextSymbol = Symbol('Context');

export class RequestContext {
	readonly privateMeta: {
		[key: symbol]: object;
	} = {};

	constructor(
		public readonly correlationId: string,
		public readonly routine: string,
	) {}

	static setContext<T>(
		routine: string,
		correlationId: string | undefined,
		callback: () => Promise<T> | T,
		initialize?: () => Promise<void> | void,
	) {
		const context = new RequestContext(correlationId || v4(), routine);
		return api.context.with(
			api.context.active().setValue(contextSymbol, context),
			async () => {
				const span = api.trace.getTracer(packageInfo.name).startSpan(routine);
				try {
					await initialize?.();
					return await callback();
				} finally {
					span.end();
					this.flush(routine);
				}
			},
		);
	}

	subContext<T>(
		subRoutine: string,
		callback: () => Promise<T> | T,
		initialize?: () => Promise<void> | void,
	) {
		return RequestContext.setContext(
			`${this.routine}.${subRoutine}`,
			this.correlationId,
			callback,
			initialize,
		);
	}

	static flush(): void;
	static flush(routine: string): void;
	static flush(routine?: string) {
		onContextEndList.forEach((callback) => {
			try {
				callback(routine);
			} catch (error) {
				console.error(`Error when calling context end callback ${error.stack}`);
			}
		});
	}
}
const loggerContextSymbol = Symbol('CoggerContext');
const rootContext = new RequestContext('root', 'root');

export class OpenTelemetryContextProvider<T extends object>
	implements ContextInfoProvider<T>
{
	static currentContext() {
		return (
			(api.context.active().getValue(contextSymbol) as RequestContext) ||
			rootContext
		);
	}

	currentContext() {
		return OpenTelemetryContextProvider.currentContext();
	}

	static subContext<T>(
		subRoutine: string,
		callback: () => Promise<T> | T,
		initialize?: () => Promise<void> | void,
	) {
		return this.currentContext().subContext(subRoutine, callback, initialize);
	}

	subContext(
		subRoutine: string,
		callback: () => Promise<T> | T,
		initialize?: () => Promise<void> | void,
	) {
		return this.currentContext().subContext(subRoutine, callback, initialize);
	}

	get correlationId() {
		return this.currentContext().correlationId;
	}

	get routine() {
		return this.currentContext().routine;
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

export const openTelemetryContextProvider = new OpenTelemetryContextProvider();

nodeCleanup(RequestContext.flush.bind(RequestContext));
