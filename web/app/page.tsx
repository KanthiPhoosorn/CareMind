import { APP_NAME } from '@caremind/shared';

export default function Home() {
  return (
    <main className="min-h-screen flex items-center justify-center">
      <div className="text-center space-y-4">
        <h1 className="text-4xl font-bold">{APP_NAME}</h1>
        <p className="text-lg text-gray-600">AI-Powered Patient Care Coordination</p>
        <a href="/login" className="inline-block px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition">
          Sign In
        </a>
      </div>
    </main>
  );
}
