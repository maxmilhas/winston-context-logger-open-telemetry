import { ContextInfoProvider } from 'winston-context-logger';
import { RequestContext } from './request-context';
import * as api from '@opentelemetry/api';

const contextSymbol = Symbol('Context');
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
}
