declare module 'supertest' {
  type SuperTestResponse = {
    body: unknown;
    headers: Record<string, string | string[] | undefined>;
    status: number;
    text: string;
  };

  type SuperTestRequest = Promise<SuperTestResponse> & {
    set(field: string, value: string): SuperTestRequest;
    set(field: Record<string, string>): SuperTestRequest;
    send(body: unknown): SuperTestRequest;
    expect(status: number): SuperTestRequest;
    expect(assertion: (response: SuperTestResponse) => void): SuperTestRequest;
  };

  export type SuperAgentTest = {
    get(path: string): SuperTestRequest;
    post(path: string): SuperTestRequest;
    patch(path: string): SuperTestRequest;
    delete(path: string): SuperTestRequest;
  };

  type SuperTestStatic = ((app: unknown) => SuperAgentTest) & {
    agent(app: unknown): SuperAgentTest;
  };

  const request: SuperTestStatic;

  export default request;
}
