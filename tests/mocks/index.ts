// Requirements: testing-infrastructure.2.1, testing-infrastructure.2.2, testing-infrastructure.2.3, testing-infrastructure.2.4

// Export file system mock
export { FileSystemMock, FileSystemMockImpl, fileSystemMock } from "./file-system-mock";

// Export network mock
export {
  NetworkMock,
  NetworkMockImpl,
  networkMock,
  HttpMethod,
  RequestOptions,
  NetworkInterceptor,
  NetworkRequest,
  MockResponse,
  RequestHandler,
} from "./network-mock";

// Export main mock system
export {
  MockSystem,
  MockSystemImpl,
  DatabaseMock,
  IPCMock,
  MockStatement,
  mockSystem,
} from "./mock-system";
