import { useState } from 'react';
import { AlertCircle, CheckCircle2, AlertTriangle, Info, X, ArrowLeft } from 'lucide-react';
import { useError } from '../contexts/error-context';

interface ErrorDemoPageProps {
  onBack: () => void;
}

export function ErrorDemoPage({ onBack }: ErrorDemoPageProps) {
  const { showSuccess, showError, showWarning, showInfo } = useError();
  const [showInlineError, setShowInlineError] = useState(false);
  const [showErrorState, setShowErrorState] = useState(false);
  const [throwError, setThrowError] = useState(false);

  // Trigger error boundary
  if (throwError) {
    throw new Error('Тестовая ошибка для демонстрации Error Boundary');
  }

  return (
    <div className="min-h-screen bg-background p-8">
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <button
            onClick={onBack}
            className="inline-flex items-center gap-2 text-primary hover:underline mb-4"
          >
            <ArrowLeft className="w-4 h-4" />
            Назад в настройки
          </button>
          <h1 className="text-3xl font-semibold text-foreground mb-2">
            Демонстрация обработки ошибок
          </h1>
          <p className="text-muted-foreground">Комплексная система обработки ошибок для Clerkly</p>
        </div>

        <div className="grid gap-6">
          {/* Toast Notifications */}
          <div className="bg-card rounded-xl border border-border shadow-sm p-6">
            <h2 className="text-xl font-semibold text-foreground mb-4">1. Toast уведомления</h2>
            <p className="text-sm text-muted-foreground mb-4">
              Быстрые всплывающие уведомления для немедленной обратной связи
            </p>
            <div className="flex flex-wrap gap-3">
              <button
                onClick={() => showSuccess('Операция успешно выполнена!')}
                className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-medium"
              >
                ✓ Успех
              </button>
              <button
                onClick={() => showError('Произошла ошибка при выполнении операции')}
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors font-medium"
              >
                ✕ Ошибка
              </button>
              <button
                onClick={() => showWarning('Внимание! Это действие требует подтверждения')}
                className="px-4 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 transition-colors font-medium"
              >
                ⚠ Предупреждение
              </button>
              <button
                onClick={() => showInfo('Новая функция теперь доступна в настройках')}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
              >
                ℹ Информация
              </button>
            </div>
          </div>

          {/* Inline Error Messages */}
          <div className="bg-card rounded-xl border border-border shadow-sm p-6">
            <h2 className="text-xl font-semibold text-foreground mb-4">
              2. Inline сообщения об ошибках
            </h2>
            <p className="text-sm text-muted-foreground mb-4">
              Контекстные ошибки, встроенные в интерфейс
            </p>

            <button
              onClick={() => setShowInlineError(!showInlineError)}
              className="mb-4 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors font-medium"
            >
              {showInlineError ? 'Скрыть ошибку' : 'Показать inline ошибку'}
            </button>

            {showInlineError && (
              <div className="space-y-3">
                {/* Error inline */}
                <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                  <div className="flex items-start gap-3">
                    <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                    <div className="flex-1">
                      <p className="text-sm font-medium text-red-900 mb-1">
                        Не удалось сохранить изменения
                      </p>
                      <p className="text-xs text-red-700">
                        Проверьте подключение к интернету и попробуйте снова
                      </p>
                    </div>
                    <button
                      onClick={() => setShowInlineError(false)}
                      className="text-red-600 hover:text-red-800"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Warning inline */}
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                  <div className="flex items-start gap-3">
                    <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                    <div className="flex-1">
                      <p className="text-sm font-medium text-amber-900 mb-1">
                        Внимание: действие не может быть отменено
                      </p>
                      <p className="text-xs text-amber-700">
                        Убедитесь, что вы действительно хотите продолжить
                      </p>
                    </div>
                  </div>
                </div>

                {/* Success inline */}
                <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                  <div className="flex items-start gap-3">
                    <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
                    <div className="flex-1">
                      <p className="text-sm font-medium text-green-900 mb-1">
                        Настройки успешно сохранены
                      </p>
                      <p className="text-xs text-green-700">Все изменения применены</p>
                    </div>
                  </div>
                </div>

                {/* Info inline */}
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <div className="flex items-start gap-3">
                    <Info className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
                    <div className="flex-1">
                      <p className="text-sm font-medium text-blue-900 mb-1">
                        Новая функция доступна
                      </p>
                      <p className="text-xs text-blue-700">
                        Теперь вы можете автоматически создавать задачи из встреч
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Error States */}
          <div className="bg-card rounded-xl border border-border shadow-sm p-6">
            <h2 className="text-xl font-semibold text-foreground mb-4">3. Состояния ошибок</h2>
            <p className="text-sm text-muted-foreground mb-4">
              Полностраничные состояния для критических ситуаций
            </p>

            <button
              onClick={() => setShowErrorState(!showErrorState)}
              className="mb-4 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors font-medium"
            >
              {showErrorState ? 'Скрыть состояние ошибки' : 'Показать состояние ошибки'}
            </button>

            {showErrorState && (
              <div className="border-2 border-dashed border-border rounded-lg p-8">
                <div className="text-center max-w-md mx-auto">
                  <div className="flex justify-center mb-4">
                    <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center">
                      <AlertCircle className="w-8 h-8 text-red-600" />
                    </div>
                  </div>
                  <h3 className="text-xl font-semibold text-foreground mb-2">
                    Не удалось загрузить данные
                  </h3>
                  <p className="text-muted-foreground mb-6">
                    Возникла проблема при загрузке информации. Попробуйте обновить страницу или
                    вернуться позже.
                  </p>
                  <div className="flex gap-3 justify-center">
                    <button className="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors font-medium">
                      Попробовать снова
                    </button>
                    <button
                      onClick={() => setShowErrorState(false)}
                      className="px-4 py-2 bg-secondary text-foreground rounded-lg hover:bg-secondary/80 transition-colors font-medium"
                    >
                      Отмена
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Error Boundary */}
          <div className="bg-card rounded-xl border border-border shadow-sm p-6">
            <h2 className="text-xl font-semibold text-foreground mb-4">4. Error Boundary</h2>
            <p className="text-sm text-muted-foreground mb-4">
              Перехват критических ошибок React для предотвращения краша приложения
            </p>

            <button
              onClick={() => setThrowError(true)}
              className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors font-medium"
            >
              Вызвать критическую ошибку
            </button>

            <div className="mt-4 bg-amber-50 border border-amber-200 rounded-lg p-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-amber-900 mb-1">Внимание!</p>
                  <p className="text-xs text-amber-700">
                    Это вызовет критическую ошибку, которая будет перехвачена Error Boundary.
                    Приложение не упадёт, и пользователь увидит понятное сообщение с возможностью
                    восстановления.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Form Validation Example */}
          <div className="bg-card rounded-xl border border-border shadow-sm p-6">
            <h2 className="text-xl font-semibold text-foreground mb-4">5. Валидация форм</h2>
            <p className="text-sm text-muted-foreground mb-4">
              Примеры ошибок валидации полей ввода
            </p>

            <div className="space-y-4 max-w-md">
              <div>
                <label className="block text-sm font-medium text-foreground mb-2">Email</label>
                <input
                  type="email"
                  defaultValue="invalid-email"
                  className="w-full px-4 py-2 bg-input-background border-2 border-red-300 rounded-lg text-foreground focus:outline-none focus:border-red-500"
                />
                <p className="mt-1 text-sm text-red-600">
                  Пожалуйста, введите корректный email адрес
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground mb-2">Пароль</label>
                <input
                  type="password"
                  defaultValue="123"
                  className="w-full px-4 py-2 bg-input-background border-2 border-red-300 rounded-lg text-foreground focus:outline-none focus:border-red-500"
                />
                <p className="mt-1 text-sm text-red-600">
                  Пароль должен содержать минимум 8 символов
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground mb-2">
                  Имя проекта
                </label>
                <input
                  type="text"
                  value=""
                  readOnly
                  className="w-full px-4 py-2 bg-input-background border-2 border-red-300 rounded-lg text-foreground focus:outline-none focus:border-red-500"
                />
                <p className="mt-1 text-sm text-red-600">Это поле обязательно для заполнения</p>
              </div>
            </div>
          </div>

          {/* Usage Guide */}
          <div className="bg-primary/5 rounded-xl border border-primary/20 p-6">
            <h2 className="text-xl font-semibold text-foreground mb-4">💡 Как использовать</h2>
            <div className="space-y-3 text-sm text-muted-foreground">
              <div>
                <strong className="text-foreground">Toast уведомления:</strong> Используйте хук{' '}
                <code className="px-2 py-0.5 bg-secondary rounded text-primary">useError()</code>{' '}
                для показа быстрых уведомлений
              </div>
              <div>
                <strong className="text-foreground">Inline ошибки:</strong> Встраивайте сообщения об
                ошибках прямо в интерфейс для контекстной обратной связи
              </div>
              <div>
                <strong className="text-foreground">Состояния ошибок:</strong> Показывайте
                полностраничные состояния при критических сбоях загрузки данных
              </div>
              <div>
                <strong className="text-foreground">Error Boundary:</strong> Автоматически
                перехватывает необработанные ошибки React и показывает понятное сообщение
              </div>
              <div>
                <strong className="text-foreground">Валидация форм:</strong> Визуализируйте ошибки
                валидации прямо под полями ввода
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
